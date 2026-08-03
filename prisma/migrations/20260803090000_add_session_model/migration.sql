-- CreateTable: Session
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    -- Unique index for fast key lookups
    CREATE UNIQUE INDEX "Session_key_key" ON "Session"("key");
    -- Index for finding sessions by key
    CREATE INDEX "Session_key_idx" ON "Session"("key");
    -- Index for finding sessions by userId
    CREATE INDEX "Session_userId_idx" ON "Session"("userId");

    -- Foreign key
    CREATE INDEX "Session_userId_fkey" ON "Session"("userId");
);

-- Add foreign key constraint
CREATE TABLE "new_Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("id", "userId", "key", "data", "createdAt", "updatedAt") SELECT "id", "userId", "key", "data", "createdAt", "updatedAt" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_key_key" ON "Session"("key");
CREATE INDEX "Session_key_idx" ON "Session"("key");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");