import express from "express";
import cors from "cors";
import routes from "./routes";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API Routes
app.use("/api", routes);

// Health check and root route
app.get("/", (req, res) => {
  res.send(
    'Server Monitor Backend is running. Available endpoints: <a href="/api/status">/api/status</a>, <a href="/api/trends">/api/trends</a>'
  );
});

app.get("/health", (req, res) => {
  res.send("Server Monitor Backend is running");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
