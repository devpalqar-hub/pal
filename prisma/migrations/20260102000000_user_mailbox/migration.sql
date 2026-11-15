-- AlterTable
ALTER TABLE `users` ADD COLUMN `mailEmail` VARCHAR(191) NULL,
    ADD COLUMN `mailPasswordEnc` TEXT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_mailEmail_key` ON `users`(`mailEmail`);
