CREATE TABLE IF NOT EXISTS items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(50),
    brand VARCHAR(50),
    serial_number VARCHAR(255),
    found_at DATETIME NOT NULL,
    location_id INT NOT NULL,
    finder_name VARCHAR(75) NOT NULL,
    storage_notes TEXT,
    logged_by INT NOT NULL,
    item_status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    image_url VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (logged_by) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;