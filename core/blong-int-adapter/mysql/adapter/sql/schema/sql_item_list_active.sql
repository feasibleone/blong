CREATE PROCEDURE `sql_item_list_active`()
BEGIN
    SELECT * FROM `sql_item` WHERE `itemActive` = 1;
END
