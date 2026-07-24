USE c237_018_team4;

-- WARNING:
-- Running this full script will delete the existing tasks and users tables.
-- Only run it when setting up or resetting the database.

--------------------------------------------------
-- DELETE OLD TABLES
--------------------------------------------------
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;

--------------------------------------------------
-- USERS TABLE
--------------------------------------------------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    contact VARCHAR(20),
    role ENUM('student', 'admin') DEFAULT 'student',
    profile_pic VARCHAR(255) DEFAULT 'profile_icon.webp',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------
-- TASKS TABLE
--------------------------------------------------
CREATE TABLE tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    module VARCHAR(100) NOT NULL,

    task_type ENUM(
        'Assignment',
        'Quiz',
        'Exam',
        'Project',
        'Study Session'
    ) DEFAULT 'Assignment',

    priority ENUM(
        'High',
        'Medium',
        'Low'
    ) DEFAULT 'Medium',

    deadline DATETIME NOT NULL,

    status ENUM(
        'Pending',
        'In Progress',
        'Completed'
    ) DEFAULT 'Pending',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_tasks_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

--------------------------------------------------
-- SAMPLE ADMIN ACCOUNT
--------------------------------------------------
INSERT INTO users (
    username,
    email,
    password,
    address,
    contact,
    role,
    profile_pic
)
VALUES (
    'admin',
    'admin@studytrack.com',
    SHA1('admin123'),
    'Republic Polytechnic',
    '91234567',
    'admin',
    'profile_icon.webp'
);