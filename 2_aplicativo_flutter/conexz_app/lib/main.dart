import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
      debugShowCheckedModeBanner: false,
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
  bool isLoading = true;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() {
              isLoading = true;
            });
          },
          onPageFinished: (String url) {
            setState(() {
              isLoading = false;
            });
          },
        ),
      )
      // ALTERE AQUI: Coloque o IP do seu computador na rede Wi-Fi local (ex: http://192.168.1.10:5000)
      ..loadRequest(Uri.parse('http://192.168.1.10:5001'));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;

        if (await controller.canGoBack()) {
          controller.goBack();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('ConexZ - Wi-Fi'),
          backgroundColor: Colors.blue,
          foregroundColor: Colors.white,
          centerTitle: true,
          // Botões de navegação adicionados na barra superior!
          actions: [
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () async {
                if (await controller.canGoBack()) {
                  controller.goBack();
                }
              },
              tooltip: 'Voltar',
            ),
            IconButton(
              icon: const Icon(Icons.arrow_forward),
              onPressed: () async {
                if (await controller.canGoForward()) {
                  controller.goForward();
                }
              },
              tooltip: 'Avançar',
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () {
                controller.reload();
              },
              tooltip: 'Recarregar',
            ),
          ],
        ),
        body: Stack(
          children: [
            WebViewWidget(controller: controller),
            if (isLoading)
              const Center(
                for (var i = 0; i < 1; i++)
                  CircularProgressIndicator(
                    color: Colors.blue,
                  ),
              ),
          ],
        ),
      ),
    );
  }
}