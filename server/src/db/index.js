'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function getDb(dbPath) {
  if (!dbPath) throw new Error('dbPath is required');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schemaSql);
  return db;
}

module.exports = { getDb };
