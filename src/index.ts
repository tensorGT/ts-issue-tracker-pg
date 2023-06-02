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
