#!/usr/bin/env node
import 'dotenv/config';
import { runCli } from './cli/main.js';

runCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
