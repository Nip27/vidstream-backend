// require('dotenv').config({path: './.env'}) 
// The above works, but we use the "import" version for consistency:
import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from './app.js'; // We will create app.js next

dotenv.config({
    path: './.env'
});

connectDB()
.then(() => {
    // Start the server only after DB is connected
    app.listen(process.env.PORT || 8000, () => {
        console.log(`⚙️ Server is running at port : ${process.env.PORT}`);
    });
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
});