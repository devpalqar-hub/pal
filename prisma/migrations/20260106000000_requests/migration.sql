-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('TASK_ASSIGNED', 'TASK_REVIEW_REQUESTED', 'TASK_COMPLETED', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_ENDED', 'TASK_DECLINED', 'REQUEST_RECEIVED', 'REQUEST_REJECTED', 'REQUEST_RESUBMITTED', 'REQUEST_APPROVED', 'REQUEST_COMPLETED', 'LEAVE_DECIDED') NOT NULL;

-- CreateTable
CREATE TABLE `service_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('PROJECT_PLAN', 'DEPLOYMENT', 'REPO_CREATION', 'PULL_REQUEST', 'ACCESS_REQUEST', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `data` JSON NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('PENDING', 'REJECTED', 'RESUBMITTED', 'APPROVED', 'COMPLETE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `projectId` INTEGER NULL,
    `requesterId` INTEGER NOT NULL,
    `assigneeId` INTEGER NOT NULL,
    `dueDate` DATE NULL,
    `decisionNote` TEXT NULL,
    `resultUrl` VARCHAR(191) NULL,
    `resubmitCount` INTEGER NOT NULL DEFAULT 0,
    `decidedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_requests_assigneeId_status_idx`(`assigneeId`, `status`),
    INDEX `service_requests_requesterId_status_idx`(`requesterId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `request_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `type` ENUM('SENT', 'REJECTED', 'RESUBMITTED', 'APPROVED', 'COMPLETED', 'CANCELLED', 'REASSIGNED') NOT NULL,
    `actorId` INTEGER NOT NULL,
    `note` TEXT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `request_events_requestId_at_idx`(`requestId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `request_events` ADD CONSTRAINT `request_events_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `service_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `request_events` ADD CONSTRAINT `request_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

