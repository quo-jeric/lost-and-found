CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(64) NOT NULL,
    record_id INT NULL,
    action VARCHAR(32) NOT NULL,
    actor_user_id INT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    request_id VARCHAR(64) NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_audit_log_table_record (table_name, record_id),
    KEY idx_audit_log_actor_user_id (actor_user_id),
    KEY idx_audit_log_created_at (created_at),
    FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
