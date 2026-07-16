import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const ConexZApp());
}

class ConexZApp extends StatelessWidget {
  const ConexZApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ConexZ',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      home: const ConexZHome(),
    );
  }
}

class ConexZHome extends StatefulWidget {
  const ConexZHome({super.key});

  @override
  State<ConexZHome> createState() => _ConexZHomeState();
}

class _ConexZHomeState extends State<ConexZHome> {
  late final WebViewController controller;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse('http://10.114.29.157:5001'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ConexZ'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: WebViewWidget(controller: controller),
    );
  }
}