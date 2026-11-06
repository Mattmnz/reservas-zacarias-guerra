-- Usuario de la aplicación en Azure SQL, con permisos mínimos (#35).
-- Se ejecuta en SSMS, conectado a la base ZacariasGuerra de Azure como administrador del servidor,
-- después de las migraciones y el seed. Es un usuario contenido: vive en la base, no en master.
-- La contraseña se escribe solo en la ventana de SSMS y nunca se guarda en este archivo.
-- Repetirlo cambia la contraseña y no duplica nada.

DECLARE @usuario SYSNAME = N'zg_app';
DECLARE @password NVARCHAR(128) = N'';

IF @password = N''
BEGIN
  RAISERROR('Escribí la contraseña en @password antes de ejecutar, y no la guardes en el archivo.', 16, 1);
  RETURN;
END;

DECLARE @sql NVARCHAR(MAX) =
  CASE WHEN DATABASE_PRINCIPAL_ID(@usuario) IS NULL THEN N'CREATE USER ' ELSE N'ALTER USER ' END
  + QUOTENAME(@usuario) + N' WITH PASSWORD = ' + QUOTENAME(@password, '''') + N';';
EXEC (@sql);

-- Solo filas: leer, insertar, actualizar y borrar. Sin crear ni modificar tablas.
ALTER ROLE db_datareader ADD MEMBER zg_app;
ALTER ROLE db_datawriter ADD MEMBER zg_app;

-- Comprobación: tiene que listar db_datareader y db_datawriter, y nada más.
SELECT r.name AS Rol
FROM sys.database_role_members m
JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
WHERE m.member_principal_id = DATABASE_PRINCIPAL_ID(@usuario);
