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
