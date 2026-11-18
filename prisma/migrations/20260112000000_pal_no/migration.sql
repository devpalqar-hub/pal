-- PAL-NO: one company-wide sequence shared by tasks and service requests.

-- CreateTable
CREATE TABLE `pal_numbers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add the columns as nullable first so existing rows can be numbered
ALTER TABLE `tasks` ADD COLUMN `palNo` INTEGER NULL;
ALTER TABLE `service_requests` ADD COLUMN `palNo` INTEGER NULL;

-- Number existing tasks and requests together, oldest first
CREATE TEMPORARY TABLE `pal_backfill` AS
  SELECT `kind`, `id`, `createdAt`, ROW_NUMBER() OVER (ORDER BY `createdAt`, `kind`, `id`) AS `n`
  FROM (
    SELECT 'TASK' AS `kind`, `id`, `createdAt` FROM `tasks`
    UNION ALL
    SELECT 'REQUEST' AS `kind`, `id`, `createdAt` FROM `service_requests`
  ) AS `x`;

UPDATE `tasks` t JOIN `pal_backfill` b ON b.`kind` = 'TASK' AND b.`id` = t.`id` SET t.`palNo` = b.`n`;
UPDATE `service_requests` r JOIN `pal_backfill` b ON b.`kind` = 'REQUEST' AND b.`id` = r.`id` SET r.`palNo` = b.`n`;

-- Reserve the used numbers so AUTO_INCREMENT continues after them
INSERT INTO `pal_numbers` (`id`, `kind`, `createdAt`) SELECT `n`, `kind`, `createdAt` FROM `pal_backfill` ORDER BY `n`;

DROP TEMPORARY TABLE `pal_backfill`;

-- Now required and unique
ALTER TABLE `tasks` MODIFY `palNo` INTEGER NOT NULL;
ALTER TABLE `service_requests` MODIFY `palNo` INTEGER NOT NULL;
CREATE UNIQUE INDEX `tasks_palNo_key` ON `tasks`(`palNo`);
CREATE UNIQUE INDEX `service_requests_palNo_key` ON `service_requests`(`palNo`);
