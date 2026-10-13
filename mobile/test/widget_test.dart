import 'package:flutter_test/flutter_test.dart';

import 'package:velio_guest/main.dart';

void main() {
  testWidgets('renders the invite page', (WidgetTester tester) async {
    await tester.pumpWidget(const VelioApp());

    expect(find.text('Invite code'), findsOneWidget);
    expect(find.text('Open invite'), findsOneWidget);
  });
}
