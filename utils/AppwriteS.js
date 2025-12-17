const {
  Client,
  Account,
  Databases,
  Users,
  Functions,
  Storage,
} = require("node-appwrite");

const { Avatars } = require("node-appwrite");
console.log(
  "Appwrite Key Loaded:",
  process.env.APPWRITE_API_KEY ? "Loaded" : "FAILED/UNDEFINED"
); // 👈 Check this!
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

console.log("Appwrite Endpoint:", process.env.APPWRITE_ENDPOINT);
console.log("Appwrite Project ID:", process.env.APPWRITE_PROJECT_ID);
console.log(
  "Appwrite API Key:",
  process.env.APPWRITE_API_KEY ? "Loaded" : "Error"
);

module.exports.account = new Account(client);
module.exports.db = new Databases(client);
module.exports.users = new Users(client);
module.exports.avatars = new Avatars(client);
module.exports.functions = new Functions(client);
module.exports.storage = new Storage(client);
