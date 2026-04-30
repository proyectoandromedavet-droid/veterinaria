CREATE TABLE IF NOT EXISTS report_runs_archive (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at      DATETIME NOT NULL,
  scheduled_report_id BIGINT UNSIGNED NULL,
  status          VARCHAR(32) NOT NULL,
  output_path     VARCHAR(255) NULL,
  generated_by    BIGINT UNSIGNED NULL,
  error_message   TEXT NULL,
  metadata_json   JSON NULL,
  PRIMARY KEY (id, created_at),
  KEY idx_report_runs_archive_created (created_at)
)
PARTITION BY RANGE (TO_DAYS(created_at)) (
  PARTITION p_hist VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

CREATE TABLE IF NOT EXISTS service_registry_snapshots_archive (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at      DATETIME NOT NULL,
  service_name    VARCHAR(120) NOT NULL,
  service_url     VARCHAR(255) NOT NULL,
  health_status   VARCHAR(32) NULL,
  metadata_json   JSON NULL,
  PRIMARY KEY (id, created_at),
  KEY idx_service_registry_snapshots_archive_created (created_at)
)
PARTITION BY RANGE (TO_DAYS(created_at)) (
  PARTITION p_hist VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
