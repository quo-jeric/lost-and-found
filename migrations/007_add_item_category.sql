ALTER TABLE items 
ADD COLUMN category_id INT NOT NULL AFTER brand;

ALTER TABLE items 
ADD FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE;
