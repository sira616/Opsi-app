import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ArrowsClockwise, Check, Prohibit } from 'phosphor-react-native';

import { Button } from '@/shared/ui/Button';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { TextField } from '@/shared/ui/TextField';
import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

import { marcaLegible, nombreDeFuente } from './BloqueMarca';
import type { LineaRevision } from './lineas';
import { razonesDe, textoTamano, type CandidatoMarca } from './marcas';

type Props = {
  /** La fila de la que se elige la marca, o null con la hoja cerrada. */
  linea: LineaRevision | null;
  onClose: () => void;
  onElegir: (candidato: CandidatoMarca) => void;
  onEscribir: (marca: string) => void;
  onSinIdentificar: () => void;
  onBuscar: () => void;
};

/**
 * Elegir la marca de una fila: los candidatos con sus razones, escribirla a mano, dejarla sin identificar o
 * volver a buscar. Todo es opcional: cerrar la hoja sin elegir deja la fila como estaba.
 */
export function HojaMarca({ linea, onClose, onElegir, onEscribir, onSinIdentificar, onBuscar }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const [escrita, setEscrita] = useState('');
  const candidatos = linea?.resolucion?.candidatos ?? [];
  const actual = linea?.eleccion?.tipo === 'candidato' ? linea.eleccion.candidato : null;

  return (
    <HojaInferior visible={linea !== null} onClose={onClose} titulo={linea ? `Marca de «${linea.nombre.trim() || 'este producto'}»` : undefined}>
      <ScrollView style={styles.lista} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        {linea?.texto ? (
          <Text style={styles.nota}>
            En el ticket: <Text style={styles.notaFuerte}>{linea.texto}</Text>
          </Text>
        ) : null}

        {candidatos.length > 0 ? (
          <View style={styles.grupo}>
            <Text style={styles.titulo}>Elige cuál es</Text>
            {candidatos.map((cand, i) => {
              const razones = razonesDe(cand);
              const elegida = actual !== null && actual.ean === cand.ean && actual.nombre === cand.nombre && actual.marca === cand.marca;
              return (
                <Pressable
                  key={`${cand.ean ?? cand.nombre}-${i}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: elegida }}
                  accessibilityLabel={`${cand.nombre}, ${cand.marca ? `marca ${cand.marca}` : 'sin marca'}`}
                  onPress={() => onElegir(cand)}
                  style={[styles.opcion, elegida && styles.opcionElegida]}
                >
                  <View style={styles.opcionTexto}>
                    <Text style={styles.opcionNombre} numberOfLines={2}>{cand.nombre}</Text>
                    <Text style={[styles.opcionMarca, cand.marca === null && styles.opcionSinMarca]}>
                      {cand.marca !== null ? marcaLegible(cand.marca) : 'Sin marca en la ficha'}
                      {textoTamano(cand.tamano) ? ` · ${textoTamano(cand.tamano)}` : ''}
                    </Text>
                    <Text style={styles.opcionRazones} numberOfLines={2}>
                      {[...razones, `de ${nombreDeFuente(cand.fuente)}`].join(' · ')}
                    </Text>
                  </View>
                  {elegida ? <Check size={18} color={c.brandInk} weight="bold" /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.nota}>No tengo ninguna opción para este producto. Puedes escribir la marca tú o dejarla sin identificar.</Text>
        )}

        <View style={styles.grupo}>
          <TextField
            label="Escribir la marca"
            value={escrita}
            onChangeText={setEscrita}
            maxLength={80}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => escrita.trim() !== '' && onEscribir(escrita)}
          />
          <Button label="Usar esta marca" variant="quiet" disabled={escrita.trim() === ''} onPress={() => onEscribir(escrita)} />
        </View>

        <View style={styles.grupo}>
          <Button
            label="Dejar sin identificar"
            variant="quiet"
            onPress={onSinIdentificar}
            icon={<Prohibit size={18} color={c.inkMuted} weight="bold" />}
          />
          <Button
            label="Buscar otra vez"
            variant="quiet"
            onPress={onBuscar}
            icon={<ArrowsClockwise size={18} color={c.inkMuted} weight="bold" />}
          />
        </View>

        <Text style={styles.nota}>Solo recuerdo lo que eliges o escribes tú aquí. Puedes verlo y borrarlo en Ajustes.</Text>
      </ScrollView>
    </HojaInferior>
  );
}

const useStyles = makeStyles((c) => ({
  lista: { maxHeight: 520 },
  contenido: { gap: space.lg, paddingBottom: space.sm },
  grupo: { gap: space.sm },
  titulo: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted },
  nota: { fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  notaFuerte: { fontFamily: fonts.medium, color: c.ink },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  opcionElegida: { borderColor: c.brand, backgroundColor: c.brandSoft },
  opcionTexto: { flex: 1, minWidth: 0, gap: 2 },
  opcionNombre: { fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },
  opcionMarca: { fontFamily: fonts.medium, fontSize: 13, color: c.brandInk },
  opcionSinMarca: { color: c.inkFaint, fontFamily: fonts.body },
  opcionRazones: { fontSize: 11.5, lineHeight: 15, color: c.inkMuted },
}));
