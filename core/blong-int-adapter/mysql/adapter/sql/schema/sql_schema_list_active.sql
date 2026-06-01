CREATE PROCEDURE `sql_schema_list_active`()
BEGIN
    SELECT * FROM `schema_item` WHERE `schemaItemActive` = 1;
END
