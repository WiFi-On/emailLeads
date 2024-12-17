import dotenv from "dotenv";

dotenv.config();

interface BitrixContactData {
  fields: {
    NAME: string;
    SECOND_NAME: string;
    LAST_NAME: string;
    PHONE: Array<{ VALUE: string; VALUE_TYPE: string }>;
    ADDRESS: string;
  };
}
interface BitrixDealData {
  fields: {
    TITLE: string;
    CONTACT_ID: string;
    SOURCE_ID: number;
    UF_CRM_1697646751446: string;
    COMMENTS: string;
    OPPORTUNITY: number;
    UF_CRM_1697462646338: string;
  };
}
interface ParsedData {
  name: string;
  secondName: string;
  lastName: string;
  phone: string;
  address: string;
}

class BitrixService {
  private hook: string;
  private methodCreateContact: string;
  private methodCreateDeal: string;
  constructor() {
    this.hook = process.env.BITRIX_HOOK || "";
    this.methodCreateContact = "crm.contact.add";
    this.methodCreateDeal = "crm.deal.add";
  }

  async pars(data: string): Promise<ParsedData> {
    const dataArr = data.split("\n");
    const fio = dataArr[0].split(" ");
    return {
      name: fio[0],
      secondName: fio[1],
      lastName: fio[2],
      address: dataArr[1],
      phone: dataArr[2],
    };
  }
  async createContact(
    name: string = "",
    secondName: string = "",
    lastName: string = "",
    phone: string = "",
    address: string = ""
  ): Promise<any> {
    const url = `${this.hook}/${this.methodCreateContact}`;
    const data: BitrixContactData = {
      fields: {
        NAME: name,
        SECOND_NAME: secondName,
        LAST_NAME: lastName,
        PHONE: [{ VALUE: phone, VALUE_TYPE: "WORK" }],
        ADDRESS: address,
      },
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      return result;
    } catch (error) {
      console.error(
        `Error sending request to Bitrix (${this.methodCreateContact}):`,
        error
      );
      throw error;
    }
  }
  async createDeal(
    id_client: string,
    id_distributor: number,
    address: string,
    comment: string,
    id_lead: string
  ): Promise<any> {
    const url = `${this.hook}/${this.methodCreateDeal}`;
    const data: BitrixDealData = {
      fields: {
        TITLE: "Заявка от VRN",
        CONTACT_ID: id_client,
        SOURCE_ID: id_distributor,
        UF_CRM_1697646751446: address,
        COMMENTS: comment,
        OPPORTUNITY: 0,
        UF_CRM_1697462646338: id_lead,
      },
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(`Response from Bitrix (${this.methodCreateDeal}):`, result);
      return result;
    } catch (error) {
      console.error(
        `Error sending request to Bitrix (${this.methodCreateDeal}):`,
        error
      );
      throw error;
    }
  }
}

export default BitrixService;
