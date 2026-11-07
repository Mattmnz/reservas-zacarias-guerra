// Días y horas del contrato de horarios (#14): 1 = lunes; horas HH:00 de 00:00 a 23:00 y apertura < cierre.
export const DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };

const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7];
// Lo que se propone al abrir un día que estaba cerrado: el horario habitual del complejo.
const APERTURA_INICIAL = '07:00';
const CIERRE_INICIAL = '22:00';

function hora(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

// Una apertura a las 23:00 no deja ningún bloque: la última es 22:00, y el primer cierre posible, 01:00.
export const HORAS_APERTURA = Array.from({ length: 23 }, (_, h) => hora(h));
export const HORAS_CIERRE = Array.from({ length: 23 }, (_, h) => hora(h + 1));

// De la respuesta de la API (solo los días abiertos) a los 7 días del formulario.
export function semanaCompleta(dias) {
  const porDia = new Map(dias.map((dia) => [dia.diaSemana, dia]));
  return DIAS_SEMANA.map((diaSemana) => {
    const dia = porDia.get(diaSemana);
    return dia
      ? { diaSemana, abierto: true, apertura: dia.apertura, cierre: dia.cierre }
      : { diaSemana, abierto: false, apertura: APERTURA_INICIAL, cierre: CIERRE_INICIAL };
  });
}

// Del formulario al cuerpo del PUT: un día cerrado no va.
export function diasAbiertos(semana) {
  return semana
    .filter((dia) => dia.abierto)
    .map(({ diaSemana, apertura, cierre }) => ({ diaSemana, apertura, cierre }));
}

// La API rechaza la semana entera con el primer error: acá se avisa antes, con el nombre del día.
// Las horas son HH:00 y se comparan como texto.
export function errorDeSemana(semana) {
  const invalido = semana.find((dia) => dia.abierto && dia.apertura >= dia.cierre);
  return invalido ? `${DIAS[invalido.diaSemana]}: la apertura debe ser anterior al cierre.` : null;
}

function rango(dia) {
  return dia ? `${dia.apertura} a ${dia.cierre}` : 'cerrado';
}

// Lo que cambia, día por día, para la confirmación. Una lista vacía es que no hay nada que guardar.
export function cambiosDeHorario(anterior, nueva) {
  const antes = new Map(anterior.map((dia) => [dia.diaSemana, dia]));
  const despues = new Map(nueva.map((dia) => [dia.diaSemana, dia]));
  const cambios = [];
  for (const diaSemana of DIAS_SEMANA) {
    const a = rango(antes.get(diaSemana));
    const b = rango(despues.get(diaSemana));
    if (a !== b) cambios.push(`${DIAS[diaSemana]}: ${a} → ${b}`);
  }
  return cambios;
}
