import "reflect-metadata";
import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USERNAME || "plumiotheca",
    password: process.env.DB_PASSWORD || "plumiotheca",
    database: process.env.DB_NAME || "plumiotheca",
    synchronize: true, // Only for development!
    logging: false,
    entities: [__dirname + "/entities/*.{ts,js}"],
    subscribers: [],
});
