import { Interfaze } from "interfaze";

const interfaze = new Interfaze();

const text = await interfaze.tasks.ocr("https://jigsawstack.com/preview/vocr-example.jpg");
console.log("OCR:", text);

const news = await interfaze.tasks.webSearch("latest AI agent news");
console.log("Web search:", news);

const fr = await interfaze.tasks.forecast("https://example.com/timeseries.csv", { periods: 30 });
console.log("Forecast:", fr);

const es = await interfaze.tasks.translate("Hello, how are you?", { to: "Spanish" });
console.log("Translate:", es);
