// api/upload.js
import formidable from "formidable";
import fs from "fs/promises";
import pdfParse from "pdf-parse";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

export const config = {
  api: {
    bodyParser: false, // Koristimo formidable, pa isključujemo ugrađeni bodyParser
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Samo POST zahtevi su dozvoljeni" });
    return;
  }

  // Parsiranje form-data pomoću formidable
  const form = formidable({
    multiples: false,
    uploadDir: "/tmp", // Privremena lokacija
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Greška prilikom parsiranja forme:", err);
      res.status(500).json({ error: "Greška prilikom parsiranja podataka" });
      return;
    }

    const file = files.file;
    if (!file) {
      res.status(400).json({ error: "Nije uploadovan fajl." });
      return;
    }

    // Provera MIME tipa
    if (file.mimetype !== "application/pdf") {
      await fs
        .unlink(file.filepath)
        .catch((err) =>
          console.error("Greška pri brisanju ne-PDF fajla:", err)
        );
      res.status(400).json({ error: "Uploadovani fajl nije PDF." });
      return;
    }

    try {
      const dataBuffer = await fs.readFile(file.filepath);
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text;

      const messages = [
        {
          role: "system",
          content:
            "Ti si asistent koji iz bankovnih izvoda izvlači ključne finansijske podatke.",
        },
        {
          role: "user",
          content: `
Iz teksta bankovnog izvoda, izdvoji listu transakcija koje predstavljaju isplate (troškove). Ne uključi transakcije koje su uplate (prilivi).
Za svaku transakciju identifikuj "category" (npr. Hrana, Komunalije, Plata, itd.) i "amount" (iznos).
Vrati validan JSON niz gde je svaki element objekat sa:
  - "category": string
  - "amount": number

Ako ne možeš da prepoznaš transakciju, preskoči je.
Molim te, vrati kompletan i validan JSON niz bez markdown oznaka, i neka se niz završava znakom "]".
Tekst bankovnog izvoda:
${text}
          `,
        },
      ];

      // Ako želiš da ne trošiš kredite, možeš ovde vratiti dummy rezultat:
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const aiResponse = await openai.chat.completions.create({
        model: "chatgpt-4o-latest",
        messages,
        max_tokens: 10000,
        temperature: 0,
      });

      let aiText = aiResponse.choices[0].message.content.trim();
      aiText = aiText.replace(/^```json\s*/, "").replace(/\s*```$/, "");

      let result;
      try {
        result = JSON.parse(aiText);
        if (!Array.isArray(result)) {
          throw new Error("Parsed JSON is not an array");
        }
      } catch (e) {
        result = { error: "Ne mogu da parsiram JSON", raw: aiText };
      }

      res.status(200).json({ data: result });
    } catch (error) {
      console.error("Greška pri obradi PDF-a:", error);
      res
        .status(500)
        .json({ error: "Došlo je do greške prilikom obrade PDF fajla." });
    } finally {
      // Brišemo privremeni fajl
      await fs
        .unlink(file.filepath)
        .catch((err) => console.error("Greška pri brisanju fajla:", err));
    }
  });
}
