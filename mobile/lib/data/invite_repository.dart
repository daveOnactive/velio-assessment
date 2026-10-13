import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/config.dart';

class InviteRepository {
  Future<Map<String, dynamic>> resolve(String code) async {
    final response = await http.get(Uri.parse('$apiBaseUrl/invites/${code.trim().toUpperCase()}'));
    return _decode(response, expectedStatus: 200);
  }

  Future<Map<String, dynamic>> claim(String code, String displayName) async {
    final response = await http.post(
      Uri.parse('$apiBaseUrl/invites/$code/claim'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'displayName': displayName}),
    );
    return _decode(response, expectedStatus: 201);
  }

  Future<void> recordAvailabilityReceipt(Map<String, dynamic> body) async {
    await http.post(
      Uri.parse('$apiBaseUrl/availability/receipt'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
  }

  Map<String, dynamic> _decode(http.Response response, {required int expectedStatus}) {
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != expectedStatus) throw Exception(body['error']);
    return body;
  }
}
