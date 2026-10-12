// Banco de DEMONSTRAÇÃO em memória (não toca no Atlas). Uso: npm run demo:db
// Em outro terminal: npm run demo:seed, depois subir o app com as variáveis que ele imprime.
import { MongoMemoryServer } from "mongodb-memory-server";

const port = Number(process.env.DEMO_DB_PORT || 27117);
const mongo = await MongoMemoryServer.create({ instance: { port, dbName: "contenthub_demo" } });
console.log(`Banco de demonstração no ar: ${mongo.getUri("contenthub_demo")}`);
console.log("Ctrl+C para encerrar (os dados somem).");
const stop = async () => {
  await mongo.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
