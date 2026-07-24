import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:ui' as ui;

void main() async {
  // Esperar o binding do Flutter
  WidgetsFlutterBinding.ensureInitialized();
  
  // Criar o ícone
  final iconData = await createIcon();
  
  // Salvar como PNG
  final bytes = await iconData.toByteData(format: ui.ImageByteFormat.png);
  if (bytes != null) {
    final directory = await getApplicationDocumentsDirectory();
    final path = '${directory.path}/icon_512.png';
    await File(path).writeAsBytes(bytes.buffer.asUint8List());
    print('✅ Ícone gerado em: $path');
  }
}

Future<ui.Image> createIcon() async {
  // Tamanho do ícone (512x512)
  const size = 512.0;
  const radius = 80.0;
  
  // Criar um canvas para desenhar o ícone
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder, Rect.fromLTWH(0, 0, size, size));
  
  // Fundo - Gradiente Azul -> Roxo
  final paint = Paint()
    ..shader = const ui.Gradient.linear(
      Offset(0, 0),
      Offset(size, size),
      [Color(0xFF00D4FF), Color(0xFF6C63FF)],
    );
  final rrect = RRect.fromLTRBXY(0, 0, size, size, radius, radius);
  canvas.drawRRect(rrect, paint);
  
  // Sombra
  final shadowPaint = Paint()
    ..color = Colors.black.withOpacity(0.2)
    ..maskFilter = MaskFilter.blur(BlurStyle.normal, 20);
  canvas.drawRRect(rrect, shadowPaint);
  
  // Texto "CZ" no centro
  final textPainter = TextPainter(
    textDirection: TextDirection.ltr,
    text: const TextSpan(
      text: 'CZ',
      style: TextStyle(
        fontSize: 160,
        fontWeight: FontWeight.w900,
        color: Colors.white,
        letterSpacing: 8,
      ),
    ),
  );
  textPainter.layout();
  
  // Centralizar o texto
  final textOffset = Offset(
    (size - textPainter.width) / 2,
    (size - textPainter.height) / 2 - 10,
  );
  textPainter.paint(canvas, textOffset);
  
  // Subtítulo "ConexZ" pequeno
  final subPainter = TextPainter(
    textDirection: TextDirection.ltr,
    text: const TextSpan(
      text: '⚡ TRANSFERÊNCIA',
      style: TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w600,
        color: Colors.white70,
        letterSpacing: 4,
      ),
    ),
  );
  subPainter.layout();
  final subOffset = Offset(
    (size - subPainter.width) / 2,
    textOffset.dy + 170,
  );
  subPainter.paint(canvas, subOffset);
  
  // Ícone de nuvem
  final cloudPaint = Paint()
    ..color = Colors.white.withOpacity(0.15)
    ..style = PaintingStyle.fill;
  
  canvas.drawCircle(Offset(size / 2, 80), 50, cloudPaint);
  
  // finalizar
  final picture = recorder.endRecording();
  final image = await picture.toImage(size.toInt(), size.toInt());
  return image;
}