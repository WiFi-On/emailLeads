// app.ts
import BitrixService from "./bitrixService.js";
import EmailService, { emailOutput } from "./emailService.js";
import dotenv from "dotenv";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import logger from "./logger.js"; // Импортируйте логгер

dotenv.config();

interface ImapConfig {
  imap: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
    authTimeout: number;
  };
}

const imapConfig: ImapConfig = {
  imap: {
    user: process.env.MAIL_USER || "",
    password: process.env.MAIL_PASSWORD || "",
    host: process.env.IMAP_HOST || "",
    port: parseInt(process.env.IMAP_PORT || "993", 10),
    tls: true, // Используем TLS
    authTimeout: 60000,
  },
};

const smtpConfig: SMTPTransport.Options = {
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT || "0", 10),
  secure: false,
  auth: {
    user: process.env.MAIL_USER || "",
    pass: process.env.MAIL_PASSWORD || "",
  },
};

const emailService = new EmailService(imapConfig, smtpConfig);
const bitrixService = new BitrixService();

const run = async () => {
  try {
    logger.info("Запуск обработки писем...");
    await emailService.connect();
    logger.info("Подключились к IMAP-серверу");
    // Парсим письма от ISP
    const emailsISP = await emailService.fetchEmails("Заявка");
    logger.info(`Получили ${emailsISP.length} писем от ISP`);
    for (let i = 0; i < emailsISP.length; i++) {
      const email = emailsISP[i];
      const idEmail = email.uid;
      const body = email.body;
      const from = email.from;

      if (from.includes("ISP <no-reply@isp-vrn.ru>")) {
        const parsedISP = await emailService.parseBodyEmailISP(body);
        logger.info(
          `Спарсил письмо от ISP. name: ${parsedISP.name} || phone: ${parsedISP.phone} || id: ${parsedISP.id}`
        );

        try {
          const contact = await bitrixService.createContact(
            parsedISP.name,
            " ",
            " ",
            parsedISP.phone,
            parsedISP.address
          );
          logger.info(`Создал контакт ISP: ${contact.result}`);
          const deal = await bitrixService.createDeal(
            contact.result,
            32,
            parsedISP.address,
            parsedISP.comment,
            parsedISP.id
          );
          logger.info(`Создал сделку ISP: ${deal.result}`);
          await emailService.moveEmails(idEmail, "ready");
        } catch (error) {
          logger.error(`Не удалось создать сделку ISP: ${error}`);
          await emailService.moveEmails(idEmail, "notReady");
        }
      } else if (from.includes("Л, Алёна <vo@isp-vrn.ru>")) {
        const parsedBodyToText = await emailService.parseBodyToText(body);
        logger.info(
          `Спарсил из body в текст от Алена(ISP): ${parsedBodyToText}`
        );
        const parsedISP = await emailService.parseBodyEmailISP(
          parsedBodyToText
        );
        logger.info(
          `Спарсил письмо от Алена(ISP). name: ${parsedISP.name} || phone: ${parsedISP.phone} || id: ${parsedISP.id}`
        );
        try {
          const contact = await bitrixService.createContact(
            parsedISP.name,
            " ",
            " ",
            parsedISP.phone,
            parsedISP.address
          );
          logger.info(`Создал контакт Алена(ISP): ${contact.result}`);
          const deal = await bitrixService.createDeal(
            contact.result,
            32,
            parsedISP.address,
            parsedISP.comment,
            parsedISP.id
          );
          logger.info(`Создал сделку Алена(ISP): ${deal.result}`);
          await emailService.moveEmails(idEmail, "ready");
        } catch (error) {
          logger.error(`Не удалось создать сделку Алена(ISP): ${error}`);
          await emailService.moveEmails(idEmail, "notReady");
        }
      }
    }
    // Парсим письма от gdelu
    const emailsGDELU = await emailService.fetchEmails("Новая заявка");
    logger.info(`Получили ${emailsGDELU.length} писем от gdelu`);
    for (let i = 0; i < emailsGDELU.length; i++) {
      const email = emailsGDELU[i];
      const idEmail = email.uid;
      const body = email.body;
      const from = email.from;

      if (from.includes("gdelu.ru")) {
        const decode = await emailService.decoderBase64(body);
        logger.info(`Декодировал письмо от gdelu: ${decode}`);
        const parsedGDELU = await emailService.parseBodyEmailGDELU(decode);
        logger.info(
          `Спарсил письмо от gdelu. name: ${parsedGDELU.name} || phone: ${parsedGDELU.phone} || id: ${parsedGDELU.id}`
        );
        try {
          const contact = await bitrixService.createContact(
            parsedGDELU.name,
            " ",
            " ",
            parsedGDELU.phone,
            parsedGDELU.address
          );
          logger.info(`Создал контакт gdelu: ${contact.result}`);
          const deal = await bitrixService.createDeal(
            contact.result,
            31,
            parsedGDELU.address,
            parsedGDELU.comment,
            parsedGDELU.id
          );
          logger.info(`Создал сделку gdelu: ${deal.result}`);
          await emailService.moveEmails(idEmail, "ready");
        } catch (error) {
          logger.error(`Не удалось создать сделку gdelu: ${error}`);
          await emailService.moveEmails(idEmail, "notReady");
        }
      }
    }

    await emailService.disconnect(); // Отключение после обработки всех писем
    logger.info("Отключено от IMAP-сервера после обработки всех писем.");
  } catch (error) {
    logger.error(`Ошибка при обработке писем: ${error}`);
  }
};

setInterval(() => {
  run();
}, 1000 * 60 * 5); // 5 минут
