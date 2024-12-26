import imap, { ImapSimpleOptions, ImapSimple } from "imap-simple";
import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { simpleParser } from "mailparser";
import logger from "./logger.js";

interface Email {
  from: string;
  subject: string;
  date: string;
  body: any;
  uid: string;
}

interface ImapMessagePart {
  which: string;
  body: any;
}

export interface emailOutput {
  name: string;
  address: string;
  phone: string;
  id: string;
  comment: string;
}

class EmailService {
  private config: ImapSimpleOptions;
  private connection: ImapSimple | null;
  private transporter: nodemailer.Transporter;

  constructor(config: ImapSimpleOptions, smtpConfig: SMTPTransport.Options) {
    this.config = config;
    this.connection = null;
    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  async connect(): Promise<void> {
    try {
      this.connection = await imap.connect(this.config);
      console.log("Connected to IMAP server");
    } catch (error) {
      console.error("Error connecting to IMAP server:", error);
    }
  }
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.end();
        console.log("Disconnected from IMAP server");
        this.connection = null;
      } catch (error) {
        console.error("Error disconnecting from IMAP server:", error);
      }
    } else {
      console.warn("Not connected to IMAP server, cannot disconnect");
    }
  }
  async decoderBase64(body: string): Promise<string> {
    const base64Decoded = Buffer.from(body, "base64").toString("utf-8");
    return base64Decoded;
  }
  async parseBodyToText(body: string): Promise<any> {
    const email = await simpleParser(body);
    return email.text;
  }
  async parseBodyEmailISP(body: string): Promise<emailOutput> {
    // Удаляем все <br /> из тела письма
    const cleanedBody = body.replace(/<br\s*\/?>/gi, "\n");

    // Разделяем очищенное тело письма по строкам
    const arrBody = cleanedBody.split("\n");

    // Инициализируем результат
    let result = {
      name: "",
      address: "",
      phone: "",
      id: "",
      comment: "",
    };

    // Разбираем строки и заполняем результат
    for (const item of arrBody) {
      if (item.includes("Телефон:")) {
        result.phone = await this.normalizePhoneNumber(
          item.split(":")[1].trim()
        );
      } else if (item.includes("Имя:")) {
        result.name = item.split(":")[1].trim();
      } else if (item.includes("Номер заявки:")) {
        result.id = item.split(":")[1].trim();
      } else if (item.includes("Примечание:")) {
        result.comment = item.split(":")[1].trim();
      } else if (
        !item.includes("Примечание:") &&
        item.includes("Клиент указал желаемый способ связи:")
      ) {
        result.comment = item.split(":")[1].trim();
        if (result.comment) {
          result.comment =
            "Клиент указал желаемый способ связи:" + result.comment;
        }
      } else if (item.includes("Адрес:")) {
        result.address = item.split(":")[1].trim();
      }
    }

    return result;
  }
  async parsedBodyEmailJustConnect(body: string): Promise<emailOutput> {
    // Удаляем все <br /> из тела письма
    const cleanedBody = body.replace(/<br\s*\/?>/gi, "\n");
    // Разделяем очищенное тело письма по строкам
    const arrBody = cleanedBody.split("\n");
    // Инициализируем результат
    let result = {
      name: arrBody[1].split(":")[1],
      address: arrBody[2].split(":")[1],
      phone: await this.normalizePhoneNumber(arrBody[5].split(":")[1]),
      id: "Нет номера заявки",
      comment: "Нет комментария",
    };
    return result;
  }
  async parseBodyEmailGDELU(body: string): Promise<emailOutput> {
    // Удаляем все <br /> из тела письма
    const cleanedBody = body.replace(/<br\s*\/?>/gi, "\n");
    // Разделяем очищенное тело письма по строкам
    const arrBody = cleanedBody.split("\n");
    // Инициализируем результат
    let result = {
      name: "",
      address: "",
      phone: "",
      id: "",
      comment: "",
    };

    result.name = arrBody[3];
    result.address = arrBody[13];
    result.phone = await this.normalizePhoneNumber(arrBody[4].split(":")[1]);
    result.id = arrBody[1].split("№")[1];
    result.comment = arrBody[15].split("Комментарий:")[1];

    return result;
  }
  async fetchEmails(subjectFilter: string): Promise<Email[]> {
    if (!this.connection) {
      throw new Error("Not connected to IMAP server");
    }

    const result: Email[] = [];

    try {
      const box = await this.connection.openBox("INBOX");
      const searchCriteria = [["SUBJECT", subjectFilter]];

      const fetchOptions = {
        bodies: ["HEADER.FIELDS (FROM SUBJECT DATE)", "TEXT"],
        markSeen: true,
      };

      const messages: any = await this.connection.search(
        searchCriteria,
        fetchOptions
      );

      for (const message of messages) {
        const { parts } = message;
        const headerPart = parts.find(
          (part: ImapMessagePart) =>
            part.which === "HEADER.FIELDS (FROM SUBJECT DATE)"
        );
        const bodyPart = parts.find(
          (part: ImapMessagePart) => part.which === "TEXT"
        );

        if (headerPart && bodyPart) {
          const header = headerPart.body as {
            from: string[];
            subject: string[];
            date: string[];
          };
          const body = bodyPart.body as string;

          const email: Email = {
            from: header.from[0],
            subject: header.subject[0],
            date: header.date[0],
            body: body,
            uid: message.attributes.uid,
          };

          result.push(email);
        } else {
          console.warn("Message parts are missing or invalid");
        }
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
    }

    return result;
  }
  async fetchEmailsByDate(
    subjectFilter = "Заявка",
    since = "1-Aug-2024",
    before = "1-Sep-2024"
  ): Promise<Email[]> {
    if (!this.connection) {
      throw new Error("Not connected to IMAP server");
    }

    const result: Email[] = [];

    try {
      // Открываем папку ready вместо INBOX
      const box = await this.connection.openBox("ready");
      console.log("Opened ready folder");

      // Указываем даты для фильтрации сообщений за август
      const searchCriteria = [
        ["SINCE", since],
        ["BEFORE", before],
        ["SUBJECT", subjectFilter],
      ];
      console.log(`Searching for criteria: ${JSON.stringify(searchCriteria)}`);

      const fetchOptions = {
        bodies: ["HEADER.FIELDS (FROM SUBJECT DATE)", "TEXT"],
        markSeen: true,
      };

      const messages: any = await this.connection.search(
        searchCriteria,
        fetchOptions
      );
      console.log(`Found ${messages.length} messages`);

      for (const message of messages) {
        const { parts } = message;
        const headerPart = parts.find(
          (part: ImapMessagePart) =>
            part.which === "HEADER.FIELDS (FROM SUBJECT DATE)"
        );
        const bodyPart = parts.find(
          (part: ImapMessagePart) => part.which === "TEXT"
        );

        if (headerPart && bodyPart) {
          const header = headerPart.body as {
            from: string[];
            subject: string[];
            date: string[];
          };
          const body = bodyPart.body as string;

          const email: Email = {
            from: header.from[0],
            subject: header.subject[0],
            date: header.date[0],
            body: body,
            uid: message.attributes.uid,
          };

          result.push(email);
        } else {
          console.warn("Message parts are missing or invalid");
        }
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
    }

    return result;
  }
  async moveEmails(uid: string, targetFolder: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to IMAP server");
    }

    try {
      await this.connection.moveMessage(uid, targetFolder);
      console.log(`Moved emails to ${targetFolder}`);
    } catch (error) {
      console.error("Error moving emails:", error);
    }
  }
  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      const mailOptions = {
        from: '"Avatell" <partner250724@avatell.ru>',
        to,
        subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${to}`);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }
  async normalizePhoneNumber(phoneNumber: string): Promise<string> {
    // Убираем все символы и пробелы
    const cleanedNumber = phoneNumber.replace(/\D/g, "");

    // Если номер начинается с "8" или "7", заменяем их на "+7"
    if (cleanedNumber.startsWith("8")) {
      return "+7" + cleanedNumber.slice(1);
    } else if (cleanedNumber.startsWith("7")) {
      return "+7" + cleanedNumber;
    }

    return cleanedNumber;
  }
}

export default EmailService;
