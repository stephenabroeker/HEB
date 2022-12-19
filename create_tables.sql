USE heb;


CREATE TABLE IF NOT EXISTS images (
    id             INTEGER NOT NULL auto_increment,
    file_name      VARCHAR(100),
    url_name       VARCHAR(100),
    label          VARCHAR(100) UNIQUE,
    s3_region      VARCHAR(100),
    s3_bucket      VARCHAR(100),
    object_detect  BOOLEAN NOT NULL,
    store_time     DATETIME NOT NULL,

    PRIMARY KEY (id) 
);


CREATE TABLE IF NOT EXISTS labels (
    id          INTEGER NOT NULL auto_increment,
    image_id    INTEGER NOT NULL,
    name        VARCHAR(300) NOT NULL,
    confidence  DOUBLE NOT NULL,

    UNIQUE(image_id, name),
    PRIMARY KEY (id),
    FOREIGN KEY (image_id) REFERENCES images (id)
);


CREATE TABLE IF NOT EXISTS aliases (
    id        INTEGER NOT NULL auto_increment,
    label_id  INTEGER NOT NULL,
    name      VARCHAR(1024) NOT NULL,

    PRIMARY KEY (id),
    FOREIGN KEY (label_id) REFERENCES labels (id)
);


CREATE TABLE IF NOT EXISTS categories (
    id        INTEGER NOT NULL auto_increment,
    label_id  INTEGER NOT NULL,
    name      VARCHAR(1024) NOT NULL,

    PRIMARY KEY (id),
    FOREIGN KEY (label_id) REFERENCES labels (id)
);


CREATE TABLE IF NOT EXISTS instances (
    id          INTEGER NOT NULL auto_increment,
    label_id    INTEGER NOT NULL,
    bb_width    DOUBLE NOT NULL,
    bb_height   DOUBLE NOT NULL,
    bb_left     DOUBLE NOT NULL,
    bb_top      DOUBLE NOT NULL,
    confidence  DOUBLE NOT NULL,

    PRIMARY KEY (id),
    FOREIGN KEY (label_id) REFERENCES labels (id)
);


CREATE TABLE IF NOT EXISTS parents (
    id        INTEGER NOT NULL auto_increment,
    label_id  INTEGER NOT NULL,
    name      VARCHAR(1024) NOT NULL,

    PRIMARY KEY (id),
    FOREIGN KEY (label_id) REFERENCES labels (id)
);


