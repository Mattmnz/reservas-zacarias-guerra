-- Esquema inicial. Las fechas las envía Node (hora de Nicaragua): ninguna columna usa GETDATE().
-- Las columnas de código usan Latin1_General_BIN2 para que los CHECK distingan mayúsculas.

CREATE TABLE Usuario (
  Id           INT IDENTITY(1,1) NOT NULL,
  Nombre       NVARCHAR(100)     NOT NULL,
  Correo       NVARCHAR(254)     NOT NULL,
  Telefono     NVARCHAR(20)      NULL,
  PasswordHash VARCHAR(100)      NOT NULL,
  Rol          VARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,
  Activo       BIT               NOT NULL CONSTRAINT DF_Usuario_Activo DEFAULT 1,
  CreadoEn     DATETIME2(0)      NOT NULL,
  CONSTRAINT PK_Usuario PRIMARY KEY (Id),
  CONSTRAINT UQ_Usuario_Correo UNIQUE (Correo),
  CONSTRAINT CK_Usuario_Rol CHECK (Rol IN ('CLIENTE', 'ADMIN')),
  -- Con la intercalación CI por defecto, sin COLLATE esta comparación siempre sería verdadera.
  CONSTRAINT CK_Usuario_CorreoMinuscula CHECK (Correo = LOWER(Correo) COLLATE Latin1_General_BIN2)
);
GO

CREATE TABLE TipoCancha (
  Id         INT IDENTITY(1,1) NOT NULL,
  Codigo     VARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,
  Nombre     NVARCHAR(50)      NOT NULL,
  PrecioHora DECIMAL(10,2)     NOT NULL,
  CONSTRAINT PK_TipoCancha PRIMARY KEY (Id),
  CONSTRAINT UQ_TipoCancha_Codigo UNIQUE (Codigo),
  CONSTRAINT CK_TipoCancha_Precio CHECK (PrecioHora > 0)
);
GO

CREATE TABLE Cancha (
  Id           INT IDENTITY(1,1) NOT NULL,
  Nombre       NVARCHAR(50)      NOT NULL,
  TipoCanchaId INT               NOT NULL,
  Activa       BIT               NOT NULL CONSTRAINT DF_Cancha_Activa DEFAULT 1,
  CreadaEn     DATETIME2(0)      NOT NULL,
  CONSTRAINT PK_Cancha PRIMARY KEY (Id),
  CONSTRAINT UQ_Cancha_Nombre UNIQUE (Nombre),
  CONSTRAINT FK_Cancha_TipoCancha FOREIGN KEY (TipoCanchaId) REFERENCES TipoCancha (Id)
);
GO

-- Día sin fila = cancha cerrada ese día.
CREATE TABLE Horario (
  Id           INT IDENTITY(1,1) NOT NULL,
  CanchaId     INT               NOT NULL,
  DiaSemana    TINYINT           NOT NULL,
  HoraApertura TIME(0)           NOT NULL,
  HoraCierre   TIME(0)           NOT NULL,
  CONSTRAINT PK_Horario PRIMARY KEY (Id),
  CONSTRAINT UQ_Horario_CanchaDia UNIQUE (CanchaId, DiaSemana),
  CONSTRAINT FK_Horario_Cancha FOREIGN KEY (CanchaId) REFERENCES Cancha (Id),
  CONSTRAINT CK_Horario_Dia CHECK (DiaSemana BETWEEN 1 AND 7),
  CONSTRAINT CK_Horario_Rango CHECK (HoraCierre > HoraApertura),
  -- Los bloques son de 1 h en punto: un horario a media hora dejaría bloques inválidos.
  CONSTRAINT CK_Horario_HoraEnPunto CHECK (
    DATEPART(MINUTE, HoraApertura) = 0 AND DATEPART(SECOND, HoraApertura) = 0
    AND DATEPART(MINUTE, HoraCierre) = 0 AND DATEPART(SECOND, HoraCierre) = 0
  )
);
GO

CREATE TABLE Reserva (
  Id              INT IDENTITY(1,1) NOT NULL,
  ClienteId       INT               NOT NULL,
  CanchaId        INT               NOT NULL,
  Inicio          DATETIME2(0)      NOT NULL,
  Monto           DECIMAL(10,2)     NOT NULL,
  Estado          VARCHAR(12) COLLATE Latin1_General_BIN2 NOT NULL,
  Activa          BIT               NOT NULL,
  MontoPenalizado DECIMAL(10,2)     NULL,
  CreadaEn        DATETIME2(0)      NOT NULL,
  ActualizadaEn   DATETIME2(0)      NOT NULL,
  CONSTRAINT PK_Reserva PRIMARY KEY (Id),
  CONSTRAINT FK_Reserva_Usuario FOREIGN KEY (ClienteId) REFERENCES Usuario (Id),
  CONSTRAINT FK_Reserva_Cancha FOREIGN KEY (CanchaId) REFERENCES Cancha (Id),
  CONSTRAINT CK_Reserva_Estado CHECK (Estado IN ('PAGADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_SHOW')),
  -- Activa alimenta el índice único filtrado del slot: solo una cancelada lo libera.
  CONSTRAINT CK_Reserva_Activa CHECK (
    (Estado = 'CANCELADA' AND Activa = 0) OR (Estado <> 'CANCELADA' AND Activa = 1)
  ),
  CONSTRAINT CK_Reserva_HoraEnPunto CHECK (DATEPART(MINUTE, Inicio) = 0 AND DATEPART(SECOND, Inicio) = 0),
  CONSTRAINT CK_Reserva_Monto CHECK (Monto > 0),
  CONSTRAINT CK_Reserva_MontoPenalizado CHECK (
    MontoPenalizado IS NULL OR (MontoPenalizado >= 0 AND MontoPenalizado <= Monto)
  )
);
GO

CREATE TABLE Pago (
  Id         INT IDENTITY(1,1) NOT NULL,
  ReservaId  INT               NOT NULL,
  Tipo       VARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,
  Monto      DECIMAL(10,2)     NOT NULL,
  Referencia VARCHAR(30)       NOT NULL,
  CreadoEn   DATETIME2(0)      NOT NULL,
  CONSTRAINT PK_Pago PRIMARY KEY (Id),
  CONSTRAINT UQ_Pago_Referencia UNIQUE (Referencia),
  CONSTRAINT FK_Pago_Reserva FOREIGN KEY (ReservaId) REFERENCES Reserva (Id),
  CONSTRAINT CK_Pago_Tipo CHECK (Tipo IN ('CARGO', 'REEMBOLSO')),
  CONSTRAINT CK_Pago_Monto CHECK (Monto > 0)
);
GO

-- UsuarioId NULL = acción del sistema (barrido de no-show).
CREATE TABLE Auditoria (
  Id             BIGINT IDENTITY(1,1) NOT NULL,
  Entidad        VARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,
  EntidadId      INT                  NOT NULL,
  Accion         VARCHAR(30)          NOT NULL,
  EstadoAnterior VARCHAR(20)          NULL,
  EstadoNuevo    VARCHAR(20)          NULL,
  UsuarioId      INT                  NULL,
  Motivo         NVARCHAR(250)        NULL,
  Fecha          DATETIME2(0)         NOT NULL,
  CONSTRAINT PK_Auditoria PRIMARY KEY (Id),
  CONSTRAINT FK_Auditoria_Usuario FOREIGN KEY (UsuarioId) REFERENCES Usuario (Id),
  CONSTRAINT CK_Auditoria_Entidad CHECK (Entidad IN ('RESERVA', 'CANCHA', 'USUARIO'))
);
GO

CREATE TABLE Notificacion (
  Id        INT IDENTITY(1,1) NOT NULL,
  UsuarioId INT               NOT NULL,
  ReservaId INT               NULL,
  Mensaje   NVARCHAR(500)     NOT NULL,
  Leida     BIT               NOT NULL CONSTRAINT DF_Notificacion_Leida DEFAULT 0,
  CreadaEn  DATETIME2(0)      NOT NULL,
  CONSTRAINT PK_Notificacion PRIMARY KEY (Id),
  CONSTRAINT FK_Notificacion_Usuario FOREIGN KEY (UsuarioId) REFERENCES Usuario (Id),
  CONSTRAINT FK_Notificacion_Reserva FOREIGN KEY (ReservaId) REFERENCES Reserva (Id)
);
GO
