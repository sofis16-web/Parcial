-- "Mesa 1" y " mesa 1 " son la misma mesa: unicidad sin mayúsculas ni espacios laterales.
CREATE UNIQUE INDEX restaurant_tables_name_ci_key ON restaurant_tables (lower(btrim(name)));
