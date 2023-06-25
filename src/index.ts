import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

type IssueStatus = "open" | "in_progress" | "closed";
type IssuePriority = "low" | "medium" | "high";

interface IssueRow {
  id: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  label: string;
  created_at: string;
}

class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/issue_db",
});

const ALLOWED_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  open: ["in_progress", "closed"],
  in_progress: ["open", "closed"],
  closed: ["open"],
};

const app = express();
app.use(express.json());

app.get("/issues", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (typeof req.query.status === "string") {
      values.push(req.query.status);
      conditions.push(`status = $${values.length}`);
    }
    if (typeof req.query.priority === "string") {
      values.push(req.query.priority);
      conditions.push(`priority = $${values.length}`);
    }
    if (typeof req.query.label === "string") {
      values.push(req.query.label);
      conditions.push(`label = $${values.length}`);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(limit, offset);

    const sql = `SELECT * FROM issues ${whereClause} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`;
    const result = await pool.query<IssueRow>(sql, values);
    res.json({ page, limit, items: result.rows });
  } catch (err) {
    next(err);
  }
});

app.post("/issues", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description : "";
    const priority: IssuePriority = req.body.priority ?? "medium";
    const label = typeof req.body.label === "string" ? req.body.label.trim() : "bug";

    if (!title) throw new HttpError(400, "title is required");
    if (!["low", "medium", "high"].includes(priority)) throw new HttpError(400, "invalid priority");

    const result = await pool.query<IssueRow>(
      "INSERT INTO issues (title, description, priority, label) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, description, priority, label]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

app.patch("/issues/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const nextStatus = req.body.status as IssueStatus;
    if (!Number.isInteger(id)) throw new HttpError(400, "invalid issue id");

    const existing = await pool.query<IssueRow>("SELECT * FROM issues WHERE id = $1", [id]);
    if (existing.rows.length === 0) throw new HttpError(404, "issue not found");

    const currentStatus = existing.rows[0].status;
    if (!ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new HttpError(400, `cannot move from ${currentStatus} to ${nextStatus}`);
    }

    const updated = await pool.query<IssueRow>("UPDATE issues SET status = $1 WHERE id = $2 RETURNING *", [
      nextStatus,
