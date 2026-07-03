# 🚀 Mini Job Queue

A Mini Job Queue** is a background task processing system that executes work asynchronously instead of making users wait.

Examples of background jobs include:

* 📧 Sending emails
* 🌐 Calling external APIs
* 🛒 Processing orders
* 📱 Sending notifications

This project is inspired by tools like **BullMQ** and **Sidekiq** and is built using **Redis**, **PostgreSQL**, and **Prisma**.

---

# ✨ Features

* Background job processing
* Automatic retries with exponential backoff
* Dead Letter Queue (DLQ)
* Delayed and scheduled jobs
* Crash recovery
* Idempotency support
* Multiple worker support
* Redis + PostgreSQL architecture

---

# 🛠 Tech Stack

| Technology | Purpose               |
| ---------- | --------------------- |
| Node.js    | Backend Runtime       |
| TypeScript | Programming Language  |
| PostgreSQL | Permanent Job Storage |
| Prisma     | Database ORM          |
| Redis      | Fast Queue Storage    |

---

# 🏗 Architecture

```
                    User
                      │
                      ▼
                 POST /jobs
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
 PostgreSQL                 Redis Queue
(Source of Truth)         (Waiting Jobs)
          │                       │
          └───────────┬───────────┘
                      │
                      ▼
                  Worker
                      │
              Process the Job
              │             │
         Success         Failure
              │             │
              ▼             ▼
        Completed      Retry Later
                            │
                   Maximum Retries?
                      │         │
                     No        Yes
                      │         ▼
                      │    Dead Letter Queue
                      ▼
                Retry Again
```

---

# 📌 Why Two Databases?

Each database has a different responsibility.

| Database       | Responsibility                                              |
| -------------- | ----------------------------------------------------------- |
| **Redis**      | Stores the waiting queue and quickly gives jobs to workers. |
| **PostgreSQL** | Stores complete job information permanently.                |

Think of it like this:

* **Redis** is a whiteboard where today's work is written.
* **PostgreSQL** is a notebook where every job is permanently recorded.

If Redis crashes or is cleared, the queue can be rebuilt from PostgreSQL because all jobs are stored there.

---

# ⚙️ How It Works

## 1. User Creates a Job

A user sends a request such as:

> Send this email.

The API performs two actions:

* Saves the complete job in PostgreSQL.
* Stores only the Job ID in Redis.

---

## 2. Worker Picks the Job

Workers continuously wait for new jobs.

When a job appears:

1. The worker removes the Job ID from Redis.
2. Fetches the complete job from PostgreSQL.
3. Marks the job as **Active**.
4. Executes the task.

Redis removes the Job ID immediately after a worker takes it, ensuring that two workers cannot process the same job.

---

## 3. Successful Execution

If everything goes well:

* The worker updates PostgreSQL.
* Job status becomes **Completed**.

---

## 4. Failed Execution

Sometimes jobs fail because:

* External API is unavailable.
* Internet connection fails.
* Email service is temporarily down.

Instead of failing permanently, the job is scheduled for another attempt.

The retry delay increases after every failure.

Example:

```
1st Retry → 2 seconds

2nd Retry → 4 seconds

3rd Retry → 8 seconds

4th Retry → 16 seconds
```

This is called Exponential Backoff.

A small random delay (jitter) is also added so thousands of jobs don't retry at the exact same moment.

---

# 💀 Dead Letter Queue (DLQ)

If a job fails even after reaching its maximum retry limit,

it is moved into the Dead Letter Queue.

These jobs require manual inspection and can be retried later if needed.

---

# ⏰ Delayed Jobs

Sometimes a job should run in the future instead of immediately.

Example:

> Send a birthday email tomorrow at 9 AM.

The job is stored in Redis with its scheduled execution time.

A background process called the **Promoter** checks every second.

When the scheduled time arrives,

the job is moved into the waiting queue where a worker can process it.

---

# 🔄 Crash Recovery

Suppose a worker crashes while processing a job.

The job would remain marked as **Active** forever.

To prevent this,

another background process called the **Reaper** runs every 30 seconds.

It checks for jobs that have been active for too long.

If such a job is found,

it is placed back into the waiting queue so another worker can continue processing it.

---

# 🔐 Idempotency

Users sometimes submit the same request multiple times by accident.

Example:

Clicking the **Submit** button twice.

An **Idempotency Key** ensures that duplicate requests create only one job.

This prevents duplicate submissions.

---

# 🔁 Complete Flow

```
                User
                  │
                  ▼
          API Receives Request
                  │
      ┌───────────┴───────────┐
      │                       │
      ▼                       ▼
 Save Job               Push Job ID
PostgreSQL                to Redis
      │                       │
      └───────────┬───────────┘
                  │
                  ▼
            Worker Waits
                  │
                  ▼
          Takes Job ID
                  │
                  ▼
   Reads Full Job from PostgreSQL
                  │
                  ▼
          Executes the Job
            │            │
            │            │
         Success      Failure
            │            │
            ▼            ▼
      Completed     Schedule Retry
                         │
                 Retry Count Exceeded?
                     │          │
                    No         Yes
                     │          ▼
                     │   Dead Letter Queue
                     ▼
              Retry Processing
```

---

# 🧩 Background Services

## API

Responsible for:

* Receiving job requests
* Saving jobs
* Adding jobs to Redis

---

## Worker

Responsible for:

* Picking jobs
* Processing them
* Updating job status

---

## Promoter

Runs every second.

Responsible for moving delayed jobs into the waiting queue.

---

## Reaper

Runs every 30 seconds.

Responsible for finding stuck jobs and requeuing them.

---

# 📦 Job Types

### Chaos Job

A testing job that randomly succeeds or fails.

Useful for testing retries, exponential backoff, and the Dead Letter Queue.

---

### Send Email

Simulates sending emails.

A real email provider can be connected later without changing the queue engine.

---

### Send Webhook

Sends a real HTTP POST request to another server.

Useful for webhook testing.

---

# ✅ Advantages

* Extremely fast queue operations using Redis.
* Permanent job storage using PostgreSQL.
* Automatic retries.
* Dead Letter Queue for failed jobs.
* Delayed job scheduling.
* Crash recovery.
* Duplicate submission prevention.
* Supports multiple workers safely.

---

# 🍽 Real-Life Example

Imagine a restaurant.

* A Customer** places an order.
* The Cashier (API) writes the order into a permanent notebook (PostgreSQL).
* The order number is also placed on the kitchen board (Redis).
* A Chef (Worker) picks the next order.
* If cooking succeeds, the order is completed.
* If something goes wrong, the order is retried after waiting.
* If it keeps failing, it goes into the **Problem Orders** folder (Dead Letter Queue).
* If a chef suddenly leaves, another chef later continues the unfinished order.

This architecture combines the speed of Redis with the reliability of PostgreSQL to build a robust and fault-tolerant background job processing system.
