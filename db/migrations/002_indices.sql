-- RNF09: un solo slot activo por cancha y hora. Una reserva CANCELADA (Activa = 0) libera el slot.
-- Insertar o actualizar Reserva exige ANSI_NULLS y QUOTED_IDENTIFIER en ON en la sesión.
CREATE UNIQUE INDEX UX_Reserva_SlotActivo ON Reserva (CanchaId, Inicio) WHERE Activa = 1;
GO

CREATE INDEX IX_Reserva_Cliente ON Reserva (ClienteId, Inicio);
GO

-- Barrido de no-show: PAGADA/CONFIRMADA con Inicio vencido.
CREATE INDEX IX_Reserva_Estado_Inicio ON Reserva (Estado, Inicio);
GO

CREATE INDEX IX_Auditoria_Entidad ON Auditoria (Entidad, EntidadId);
GO

CREATE INDEX IX_Notificacion_Usuario_Leida ON Notificacion (UsuarioId, Leida);
GO

-- SQL Server no indexa las FK por su cuenta; historial y detalle traen los pagos de cada reserva.
CREATE INDEX IX_Pago_Reserva ON Pago (ReservaId);
GO
