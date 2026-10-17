CREATE TABLE IF NOT EXISTS claims (
    claim_id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    claimant_name VARCHAR(50) NOT NULL,
    claimant_email VARCHAR(50),
    claimant_phone VARCHAR(20),
    proof_description TEXT,
    claim_status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    processed_by INT DEFAULT NULL,
    processing_notes TEXT,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES users(user_id)   
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;