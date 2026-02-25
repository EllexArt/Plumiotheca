import app from './app';
import { AppDataSource } from "./data-source";

const port = process.env.PORT || 3000;

AppDataSource.initialize()
    .then(() => {
        console.log("Data Source has been initialized!");
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error("Error during Data Source initialization", err);
    });