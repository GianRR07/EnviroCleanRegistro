import { Client, Databases, ID, Storage } from "appwrite";

const client = new Client();

client
  .setEndpoint("https://nyc.cloud.appwrite.io/v1")
  .setProject("6a46e8b90028a108e50f");

export const databases = new Databases(client);
export const storage = new Storage(client);
export { ID };

