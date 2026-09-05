// Manual Básico Revisado, capítulo 7, tablas 7-2 (p.132), 7-3 (p.138), 7-4 (p.143).
// Datos de juego transcritos y cotejados visualmente. Descripciones resumidas originales,
// no transcripciones del libro. Precios orientativos; no se descuentan créditos.
import { normalizeText } from './inventory-utils.js';
const records = [];
function entry(name, category, price, weight, stats, description, page) {
  records.push({ id: normalizeText(name).replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''), name, category, price, weight, stats, description, page });
}
const weapon = (name, price, weight, damage, critical, range, description) => entry(name, 'Armas', price, weight, `Daño ${damage} · Crítico ${critical}${range ? ` · Incremento ${range} m` : ''}`, description, 132);
const ammo = (name, price, weight, description) => entry(name, 'Munición', price, weight, 'Precio y peso del lote indicado en el nombre.', description, 132);
const gear = (name, price, weight, description, stats = '') => entry(name, 'Equipo', price, weight, stats, description, 143);
const armor = (name, price, weight, type, reduction, dex, penalty, speed, description) => entry(name, 'Blindaje', price, weight, `${type} · RD ${reduction} (heridas) · DES máx. +${dex} · Penal. ${penalty} · Vel. ${speed} m (base 10/6)`, description, 138);

weapon('Atlatl', 50, 1.5, '2d4 cuerpo a cuerpo', '20', 10, 'Lanzador gungan de bolas de energía. El incremento corresponde a las bolas, no al golpe cuerpo a cuerpo.');
weapon('Cesta', 100, 1.8, '2d4 cuerpo a cuerpo', '20', 20, 'Vara gungan para impulsar bolas de energía a distancia.');
ammo('Bolas de energía (10)', 200, 0.35, 'Proyectiles gungan: daño 2d8 al lanzarlos con cesta o atlatl.');
weapon('Cuchillo', 25, 1, '1d4', '20', 2, 'Hoja corta que sirve como herramienta, arma de mano o arma arrojadiza.');
weapon('Espada', 150, 2, '1d8', '20', null, 'Hoja de combate de tamaño mediano; pertenece al grupo de armas exóticas.');
weapon('Gaderffii', 50, 2, '1d8/1d6', '20', null, 'Arma doble tusken, con extremos para cortar y perforar.');
weapon('Garrote/porra', 15, 1.5, '1d6', '20', 2, 'Arma sencilla para golpear, que también puede arrojarse.');
weapon('Guantes de combate', 200, 1, '+2 al daño sin armas', 'Ver dote', null, 'Guantes reforzados para aumentar el daño de los golpes. Los críticos dependen de Artes marciales.');
weapon('Lanza', 60, 1.5, '1d8', '20', 4, 'Asta con punta para herir a corta distancia o arrojar contra un objetivo.');
weapon('Maza ligera', 50, 2.5, '1d6', '20', null, 'Arma sencilla de impacto con cabeza metálica pesada.');
weapon('Pica de fuerza', 500, 1.8, '2d8', '20', null, 'Vibroarma de asta con descarga eléctrica y ajuste de aturdimiento (Fortaleza CD 15).');
weapon('Porra aturdidora', 500, 1.8, 'Aturdimiento', '—', null, 'Porra eléctrica para incapacitar en combate cercano; Fortaleza CD 15.');
weapon('Sable de luz', 3000, 1, '2d8', '19–20', null, 'Arma exótica de hoja energética. El daño de un portador concreto puede variar con su ficha.');
weapon('Sable de luz, doble', 7000, 2, '2d8/2d8', '19–20', null, 'Sable de dos hojas energéticas; se maneja como arma doble.');
weapon('Vara', 65, 1.8, '1d6/1d6', '20', null, 'Bastón largo de combate que permite usar ambos extremos.');
weapon('Vibrodaga', 200, 1, '2d4', '20', null, 'Hoja vibratoria corta para combate cuerpo a cuerpo.');
weapon('Vibromachete', 250, 1.8, '2d6', '20', null, 'Arma cortante de tamaño mediano asistida por vibración.');
weapon('Vibrohacha', 500, 2, '2d10', '20', null, 'Vibroarma grande de filo pesado para golpes potentes.');
weapon('Bláster de bolsillo', 300, 0.5, '3d4', '20', 4, 'Pistola energética compacta, fácil de ocultar, con alcance reducido.');
weapon('Bláster de caza', 300, 1, '3d4', '20', 8, 'Pistola bláster de baja potencia pensada para la caza.');
weapon('Bláster pesado', 750, 1.3, '3d8', '20', 8, 'Pistola bláster potente de tamaño mediano; admite fuego múltiple.');
weapon('Pistola bláster', 500, 1, '3d6', '20', 10, 'Arma energética de mano de uso común; admite fuego múltiple.');
weapon('Pistola de iones', 250, 1, '3d6', '20', 8, 'Arma de mano contra droides y electrónica. Consultá las reglas especiales de daño iónico.');
weapon('Bláster ligero de repetición', 2000, 6, '3d8', '19–20', 40, 'Arma grande de apoyo con fuego múltiple y automático.');
weapon('Carabina bláster', 900, 2.2, '3d8', '19–20', 20, 'Arma larga compacta que combina potencia y facilidad de transporte.');
weapon('Fusil bláster', 1000, 4.5, '3d8', '19–20', 30, 'Arma larga militar para disparos a distancia; admite fuego múltiple.');
weapon('Fusil bláster de caza', 800, 4, '3d6', '19–20', 40, 'Fusil de caza con mayor incremento de distancia y menor potencia que el modelo militar.');
weapon('Fusil de iones', 800, 3.1, '3d8', '19–20', 30, 'Arma iónica larga contra objetivos electrónicos; aplica las reglas especiales de iones.');
weapon('Detonador térmico', 2000, 0.5, '8d6+6', '20', 4, 'Explosivo de radio 8 m. Reflejos CD 15 reduce a la mitad el daño de la explosión.');
weapon('Granada de fragmentación', 500, 0.5, '4d6+1', '20', 4, 'Explosivo de fragmentos con radio 4 m. Reflejos CD 15 reduce el daño a la mitad.');
weapon('Granada aturdidora', 600, 0.5, 'Aturdimiento', '—', 4, 'Granada incapacitante de radio 4 m; Fortaleza CD 15 en impacto directo y CD 12 en el área.');
weapon('Arco', 300, 1.4, '1d8', '20', 12, 'Arma primitiva que dispara flechas físicas.');
ammo('Flechas (10)', 20, 0.8, 'Lote de diez proyectiles para arco.');
weapon('Honda', 35, 0.3, '1d4', '20', 6, 'Arma primitiva para lanzar pequeños proyectiles.');
ammo('Proyectiles de honda (10)', 5, 1, 'Lote de diez proyectiles para honda.');
weapon('Red', 25, 4.5, 'Ver reglas de red', '—', 2, 'Arma arrojadiza para enredar al objetivo en lugar de infligir daño normal.');
weapon('Electro-red', 300, 7, 'Ver reglas de red', '—', 2, 'Red electrificada que combina sujeción y aturdimiento (Fortaleza CD 12).');
weapon('Fusil lanzaproyectiles', 300, 4, '2d8', '20', 20, 'Fusil de munición física, no de haces de energía.');
weapon('Pistola lanzaproyectiles', 275, 1.4, '2d6', '20', 10, 'Arma corta que dispara balas físicas.');
weapon('Ballesta láser', 1500, 8, '3d10', '19–20', 10, 'Arma exótica wookiee que dispara lances impulsados por energía.');
ammo('Lances (10)', 400, 1, 'Lote de diez proyectiles para ballesta láser.');
weapon('Bláster E-Web', 8000, 38, '6d8', '19–20', 80, 'Arma pesada de apoyo con fuego múltiple y automático; requiere su equipo de emplazamiento.');
weapon('Bláster pesado de repetición', 4000, 12, '4d8', '19–20', 30, 'Arma pesada para fuego sostenido, múltiple o automático.');
weapon('Cañón bláster', 3000, 18, '4d8', '19–20', 40, 'Arma pesada energética de gran tamaño y potencia.');

armor('Casco y chaleco protectores', 500, 3, 'Ligero', 2, 5, -1, '10/6', 'Protección ligera para cabeza y torso frente a impactos y energía.');
armor('Mono de combate', 1500, 8, 'Ligero', 3, 4, -3, '10/6', 'Mono acolchado que combina protección limitada con movilidad.');
armor('Traje de vuelo acolchado', 800, 5, 'Ligero', 2, 4, -2, '10/6', 'Traje de piloto con protección ambiental y acolchado contra ataques.');
armor('Blindaje acolchado de combate', 2000, 13, 'Intermedio', 4, 3, -4, '8/4', 'Blindaje de combate con predominio del acolchado sobre las placas rígidas.');
armor('Blindaje intermedio de combate', 6000, 16, 'Intermedio', 5, 2, -5, '8/4', 'Combinación de placas y acolchado que sacrifica movilidad por protección.');
armor('Traje de vuelo blindado', 4000, 20, 'Intermedio', 4, 3, -4, '8/4', 'Traje de piloto reforzado para mayor protección en combate.');
armor('Blindaje pesado de combate', 12000, 35, 'Pesado', 7, 0, -7, '6/2', 'Cobertura de placas pesadas con fuertes restricciones al movimiento.');
armor('Traje espacial blindado', 10000, 45, 'Pesado', 6, 1, -6, '6/2', 'Protección espacial con blindaje para entornos peligrosos.');
armor('Armazón de combate', 12000, 20, 'Potenciado', 3, 0, -8, '6/2', 'Armazón con seis soportes. Armas, munición y alimentación se compran aparte.');
armor('Blindaje de soldado de asalto', 8000, 16, 'Potenciado', 5, 2, -2, '8/4', 'Blindaje imperial con casco equipado con comunicador y sistemas auxiliares.');
armor('Traje potenciado corelliano', 10000, 18, 'Potenciado', 6, 0, -4, '8/4', 'Traje reforzado con asistencia energética. Revisá sus particularidades con el máster.');

gear('Barra luminosa', 10, 1, 'Luz portátil de haz dirigido.', 'Ilumina hasta 10 m.');
gear('Botiquín', 25, 1, 'Instrumentos y medicinas para primeros auxilios, estabilización y recuperación de vitalidad mediante Curar heridas.');
gear('Capa aislante', 100, 1.5, 'Abrigo envolvente para condiciones meteorológicas adversas.', '+2 por equipo a Fortaleza contra mal tiempo.');
gear('Célula de energía', 10, null, 'Fuente energética para aparatos compatibles. Comprobá el tipo de alimentación de cada dispositivo.');
gear('Chip de crédito', 100, 0.1, 'Soporte electrónico de pagos y acceso a fondos. El precio del chip no es el dinero almacenado.');
gear('Cilindro de códigos', 500, 0.1, 'Dispositivo de identificación y acceso a sistemas autorizados. No concede permisos universales.');
gear('Cinturón de accesorios', 600, 4, 'Conjunto portátil de útiles habituales. El contenido exacto depende del modelo; no se desglosa automáticamente.');
gear('Comunicador', 200, 0.1, 'Transceptor personal para comunicación inalámbrica.', 'Alcance normal: 50 km u órbita baja.');
gear('Electrobinoculares', 1000, 1, 'Óptica electrónica con lecturas de distancia y visión nocturna.', 'Observar: penalización por distancia de −1 cada 20 m.');
gear('Equipo de campaña', 1000, 10, 'Mochila con agua, raciones, iluminación y material de supervivencia. Registrá el conjunto o sus piezas, no ambos.');
gear('Equipo de seguridad', 750, 1, 'Herramientas especializadas para cerraduras y sistemas de seguridad.', '+2 a Inutilizar mecanismo y Reparar sistemas de seguridad.');
gear('Equipo de seguridad superior (+1)', 1500, 1.2, 'Versión mejorada del equipo de seguridad, con control de frecuencias de alarmas.', '+3 por equipo en las pruebas aplicables.');
gear('Generador de cable líquido', 25, 0.2, 'Depósito que produce cable al solidificar su contenido.', '20 m de cable; soporta hasta 500 kg.');
gear('Holograbador', 3000, 1, 'Grabador portátil de imágenes tridimensionales y sonido.', 'Memoria interna: hasta 200 horas.');
gear('Holoproyector personal', 1000, 0.5, 'Proyecta hologramas grabados o recibidos mediante comunicador.', 'El modelo con sonido cuesta el doble.');
gear('Instrumental quirúrgico', 1000, 1, 'Herramientas de operación para personajes con la dote Cirugía.');
gear('Juego de herramientas', 250, 1, 'Utensilios para mantenimiento electrónico y mecánico.', '+2 por equipo en Reparar.');
gear('Lanzaclavos', 50, 0.3, 'Pistola de ascensión con anclaje y cable para escalar.', 'Reserva para 20 m de cable.');
gear('Linterna de fusión', 25, 2, 'Dispositivo de mano que emite luz y calor.', 'Ilumina un radio de 10 m.');
gear('Macrobinoculares', 600, 0.8, 'Óptica de aumento con lecturas de distancia y altitud.', 'Observar: penalización por distancia de −1 cada 10 m.');
gear('Máscara respiratoria', 200, 2, 'Mascarilla con soporte vital portátil. No protege del vacío ni de temperaturas extremas.', 'Aproximadamente 1 h por filtro y recipiente.');
gear('Recipiente atmosférico/filtro', 25, 1, 'Recambio de la máscara respiratoria.', 'Sustitución: Reparar CD 10; véase descripción del manual.');
gear('Medpac', 100, 1, 'Material desechable para tratar heridas; se consume al usarlo.', 'Cura 1d2 heridas: Curar heridas CD 15, asalto completo. Un beneficio por personaje cada 24 h.');
gear('Medpac superior (+1)', 200, 1.2, 'Medpac mejorado de un solo uso.', 'Cura 1d2+1 heridas; mantiene los requisitos y límite diario del medpac.');
gear('Módulo de datos', 1000, 3, 'Ordenador portátil para consultas, cálculos y descarga de información.', '+2 por equipo en las pruebas indicadas en su descripción.');
gear('Tarjeta de datos, 1 programa', 300, 0.1, 'Tarjeta con un programa o conjunto de información para un módulo de datos.');
gear('Tarjetas de datos, vírgenes (10)', 10, 0.2, 'Lote de diez tarjetas de almacenamiento vacías. El precio y peso corresponden al lote.');
gear('Módulo de datos superior (+1)', 2000, 3, 'Versión mejorada del módulo portátil.', '+3 por equipo en las pruebas aplicables.');
gear('Respirador aquata', 350, 0.2, 'Boquilla compacta para respirar bajo el agua o en atmósferas peligrosas.', 'Hasta 2 horas de aire.');
gear('Tanque de bacta', 100000, 500, 'Instalación médica de inmersión para curación. El bacta se adquiere por separado.', 'Requiere 300 litros de bacta.');
gear('Bacta, 1 litro', 100, 2, 'Agente terapéutico utilizado en tanques de curación. Precio y peso indicados para 1 litro.');
gear('Traje de vuelo', 250, 3, 'Traje y casco de piloto con soporte vital y protección ambiental. No equivale al modelo blindado.');
gear('Unidad de alimentación', 25, 0.1, 'Batería compacta para alimentar un arma energética compatible.');
gear('Unidad sensora', 1500, 9, 'Escáner portátil de señales, formas de vida y energía.', 'Radio 50 m; +2 por equipo a Escuchar, Buscar y Observar.');
gear('Unidad sensora superior (+1)', 3000, 9, 'Versión mejorada del escáner portátil.', '+3 por equipo en las pruebas aplicables.');
gear('Varilla grabadora', 500, 1, 'Soporte reutilizable de grabación de imagen y sonido.', 'Hasta 100 horas; capta en un radio de 15 m.');

export const CATALOG = Object.freeze(records.map(Object.freeze));
export function catalogNotes(item) {
  const weight = item.weight === null ? 'Peso no indicado' : `${item.weight} kg`;
  return `${item.description}\n${item.stats}${item.stats ? ' · ' : ''}${weight} · Ref. ${item.price} cr.\nManual Básico Revisado, p. ${item.page}.`;
}
export function catalogEntryForItem(item) {
  return CATALOG.find((entry) => normalizeText(entry.name) === normalizeText(item?.name));
}
