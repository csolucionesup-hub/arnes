/* grafo-hermoso.css — estética de la Vista de Grafo (tu segundo cerebro).
   Los NODOS de colores son los protagonistas; las líneas son hilos tenues.
   El grafo usa WebGL: el CSS solo puede fijar COLORES vía estas clases-puente. */

/* Líneas de enlace: hilo tenue azul-grisáceo en vez de un color cargado */
.graph-view.color-line {
  color: rgba(128, 150, 190, 0.20);
}

/* Al pasar el mouse / enfocar un nodo: sus enlaces se iluminan */
.graph-view.color-line-highlight {
  color: rgba(180, 205, 255, 0.90);
}

/* Texto de los nodos: blanco suave, legible sobre negro */
.graph-view.color-text {
  color: rgba(214, 224, 244, 0.88);
}

/* Nodo enfocado y su contorno: blanco para que resalte al hacer hover */
.graph-view.color-fill-highlight {
  color: #ffffff;
}
.graph-view.color-circle {
  color: rgba(255, 255, 255, 0.55);
}

/* Enlaces no resueltos (a notas que aún no existen): apenas visibles */
.graph-view.color-fill-unresolved {
  color: rgba(120, 130, 150, 0.35);
}
