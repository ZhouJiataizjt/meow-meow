SET NAMES utf8mb4;

UPDATE entries
SET payload = JSON_SET(payload, '$.location', '小谷围大学城')
WHERE kind IN ('records', 'map_records')
  AND NOT (
      (COALESCE(JSON_TYPE(JSON_EXTRACT(payload, '$.location')), '') = 'STRING'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.location')) REGEXP '[^[:space:]]')
      OR
      (COALESCE(JSON_TYPE(JSON_EXTRACT(payload, '$.title')), '') = 'STRING'
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.title')) REGEXP '[^[:space:]]')
  );

SELECT ROW_COUNT() AS filled_locations;
