-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('TASK_ASSIGNED', 'TASK_REVIEW_REQUESTED', 'TASK_COMPLETED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_ENDED', 'TASK_DECLINED', 'LEAVE_DECIDED') NOT NULL;

-- AlterTable
ALTER TABLE `task_events` MODIFY `type` ENUM('CREATED', 'ASSIGNED', 'ASSIGNMENT_REJECTED', 'STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'ENDED') NOT NULL;

-- CreateTable
CREATE TABLE `task_assignees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `taskId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `status` ENUM('ASSIGNED', 'REJECTED') NOT NULL DEFAULT 'ASSIGNED',
    `rejectReason` TEXT NULL,
    `rejectedAt` DATETIME(3) NULL,
    `workedSeconds` INTEGER NOT NULL DEFAULT 0,
    `lastResumedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_assignees_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `task_assignees_taskId_userId_key`(`taskId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `task_assignees` ADD CONSTRAINT `task_assignees_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignees` ADD CONSTRAINT `task_assignees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing single assignee becomes a TaskAssignee row
INSERT INTO `task_assignees` (`taskId`, `userId`, `status`, `workedSeconds`, `lastResumedAt`, `startedAt`, `doneAt`, `createdAt`)
SELECT `id`, `assigneeId`, 'ASSIGNED', `workedSeconds`, `lastResumedAt`, `startedAt`,
       CASE WHEN `status` IN ('COMPLETED', 'IN_REVIEW', 'ENDED') THEN `completedAt` ELSE NULL END, `createdAt`
FROM `tasks` WHERE `assigneeId` IS NOT NULL;
