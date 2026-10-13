import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'core/config.dart';
import 'data/invite_repository.dart';

void main() => runApp(const VelioApp());

class VelioApp extends StatelessWidget {
  const VelioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Velio',
      theme: ThemeData(
        colorSchemeSeed: const Color(0xff185c3e),
        useMaterial3: true,
      ),
      home: const InvitePage(),
    );
  }
}

class InvitePage extends StatefulWidget {
  const InvitePage({super.key});

  @override
  State<InvitePage> createState() => _InvitePageState();
}

class _InvitePageState extends State<InvitePage> {
  final code = TextEditingController();
  final name = TextEditingController();
  Map<String, dynamic>? invite;
  String? message;
  bool loading = false;
  io.Socket? socket;
  final repository = InviteRepository();

  @override
  void initState() {
    super.initState();
    _loadCached();
  }

  Future<void> _loadCached() async {
    final preferences = await SharedPreferences.getInstance();
    final saved = preferences.getString('invite');
    if (saved != null && mounted) {
      setState(() {
        invite = jsonDecode(saved) as Map<String, dynamic>;
        message = 'Showing saved activity details. Connect to claim.';
      });
    }
  }

  Future<void> _open() async {
    setState(() => loading = true);
    try {
      final value = await repository.resolve(code.text);
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString('invite', jsonEncode(value));
      if (!mounted) return;
      setState(() => invite = value);
      _subscribe(value['activityId'] as String);
    } catch (error) {
      if (mounted) setState(() => message = _displayError(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _subscribe(String activityId) {
    socket?.dispose();
    socket = io.io(apiBaseUrl, {'transports': ['websocket']});
    socket!.onConnect((_) => socket!.emit('subscribe', {'activityId': activityId}));
    socket!.on('availability', (event) {
      if (event['activityId'] != activityId || !mounted) return;
      _refreshInvite();
      repository.recordAvailabilityReceipt({
          'activityId': activityId,
          'clientId': 'flutter-${DateTime.now().millisecondsSinceEpoch}',
          'publishedAt': event['publishedAt'],
          'platform': 'flutter',
      });
    });
  }

  Future<void> _refreshInvite() async {
    if (invite == null) return;
    try {
      final refreshed = await repository.resolve(invite!['code'] as String);
      if (mounted) {
        setState(() {
          invite = refreshed;
          message = 'Availability updated.';
        });
      }
    } catch (_) {
      // The previously loaded invite remains available for a later retry.
    }
  }

  Future<void> _claim() async {
    if (invite == null) return;
    setState(() => loading = true);
    try {
      final result = await repository.claim(invite!['code'] as String, name.text.trim());
      await HapticFeedback.mediumImpact();
      if (mounted) {
        setState(() {
          invite = {
            ...invite!,
            'activity': result['activity'],
            'availableSpots': result['activity']['available_spots'],
          };
          message = 'You are in. Your spot is now filled.';
        });
      }
    } catch (error) {
      if (mounted) setState(() => message = _displayError(error));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  String _displayError(Object error) => error.toString().replaceFirst('Exception: ', '');

  @override
  void dispose() {
    code.dispose();
    name.dispose();
    socket?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activity = invite?['activity'] as Map<String, dynamic>?;
    final availableSpots = invite?['availableSpots'] ?? activity?['available_spots'];
    return Scaffold(
      appBar: AppBar(title: const Text('Velio invite')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: ListView(
          children: [
            Text('Join a plan in real life', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 16),
            TextField(
              controller: code,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Invite code'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: loading ? null : _open,
              child: Text(loading ? 'Loading…' : 'Open invite'),
            ),
            if (activity != null) ...[
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(activity['title'], style: Theme.of(context).textTheme.headlineSmall),
                      Text('Invited by ${invite!['inviter']['displayName']}'),
                      Text('$availableSpots spots left'),
                      const SizedBox(height: 12),
                      TextField(controller: name, decoration: const InputDecoration(labelText: 'Your name')),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: loading ? null : _claim, child: const Text('Claim your spot')),
                    ],
                  ),
                ),
              ),
            ],
            if (message != null) ...[
              const SizedBox(height: 16),
              Text(message!, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
            ],
          ],
        ),
      ),
    );
  }
}
