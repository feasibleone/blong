CREATE PROCEDURE `sql_item_list_active`()
BEGIN
    SELECT * FROM `item` WHERE `itemActive` = 1;
END
