#!/bin/bash
set -e

mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
	CREATE DATABASE IF NOT EXISTS portofolio_test;
	GRANT ALL PRIVILEGES ON portofolio_test.* TO '$MYSQL_USER'@'%';
	FLUSH PRIVILEGES;
EOSQL
