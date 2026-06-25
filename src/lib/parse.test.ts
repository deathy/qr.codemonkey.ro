import { describe, it, expect } from 'vitest';
import { parsePayload, parseICalDate, toVCard, toICS, type ContactData, type CalendarData } from './parse';

// NOTE: all payloads below use fictional data only — made-up names, reserved
// 555 phone numbers, example.com addresses, the canonical public example IBAN,
// and the well-known RFC test OTP secret. Airport codes are real (public).

describe('Wi-Fi', () => {
  it('parses SSID, security, password, hidden', () => {
    const p = parsePayload('WIFI:T:WPA;S:Example Net;P:demopass123;H:false;;');
    expect(p.kind).toBe('wifi');
    if (p.kind !== 'wifi') return;
    expect(p.ssid).toBe('Example Net');
    expect(p.security).toBe('WPA');
    expect(p.password).toBe('demopass123');
    expect(p.hidden).toBe(false);
  });

  it('unescapes special characters in values', () => {
    const p = parsePayload('WIFI:T:WPA;S:Net\\;With\\;Semis;P:p\\:ss;;');
    if (p.kind !== 'wifi') throw new Error('expected wifi');
    expect(p.ssid).toBe('Net;With;Semis');
    expect(p.password).toBe('p:ss');
  });
});

describe('Contact', () => {
  it('parses a MeCard (Surname,Given -> Given Surname)', () => {
    const p = parsePayload(
      'MECARD:N:Doe,Jane;TEL:+15555550123;EMAIL:jane@example.com;ORG:Example Co;URL:https://example.com;;'
    );
    expect(p.kind).toBe('contact');
    if (p.kind !== 'contact') return;
    expect(p.name).toBe('Jane Doe');
    expect(p.phones).toEqual(['+15555550123']);
    expect(p.emails).toEqual(['jane@example.com']);
    expect(p.org).toBe('Example Co');
  });

  it('parses a vCard with multiple fields', () => {
    const card = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Jane Doe',
      'ORG:Example Co',
      'TITLE:Engineer',
      'TEL;TYPE=CELL:+15555550123',
      'EMAIL:jane@example.com',
      'URL:https://example.com',
      'END:VCARD'
    ].join('\r\n');
    const p = parsePayload(card);
    if (p.kind !== 'contact') throw new Error('expected contact');
    expect(p.name).toBe('Jane Doe');
    expect(p.title).toBe('Engineer');
    expect(p.phones).toEqual(['+15555550123']);
    expect(p.emails).toEqual(['jane@example.com']);
  });
});

describe('Geo', () => {
  it('parses coordinates and label', () => {
    const p = parsePayload('geo:44.4268,26.1025?q=City+Center');
    if (p.kind !== 'geo') throw new Error('expected geo');
    expect(p.lat).toBeCloseTo(44.4268);
    expect(p.lng).toBeCloseTo(26.1025);
    expect(p.label).toBe('City Center');
  });

  it('falls back to text on non-numeric coordinates', () => {
    expect(parsePayload('geo:abc,def').kind).toBe('text');
  });
});

describe('Email / Phone / SMS', () => {
  it('parses mailto with subject and body', () => {
    const p = parsePayload('mailto:jane@example.com?subject=Hello&body=Hi%20there');
    if (p.kind !== 'email') throw new Error('expected email');
    expect(p.to).toBe('jane@example.com');
    expect(p.subject).toBe('Hello');
    expect(p.body).toBe('Hi there');
  });

  it('treats a bare address as email', () => {
    expect(parsePayload('jane@example.com').kind).toBe('email');
  });

  it('parses tel', () => {
    const p = parsePayload('tel:+15555550123');
    if (p.kind !== 'phone') throw new Error('expected phone');
    expect(p.number).toBe('+15555550123');
  });

  it('parses SMSTO number and message', () => {
    const p = parsePayload('SMSTO:+15555550123:See you at five');
    if (p.kind !== 'sms') throw new Error('expected sms');
    expect(p.number).toBe('+15555550123');
    expect(p.message).toBe('See you at five');
  });
});

describe('Calendar', () => {
  it('parses an event with UTC times', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Team Sync',
      'DTSTART:20260701T090000Z',
      'DTEND:20260701T093000Z',
      'LOCATION:Room 1',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const p = parsePayload(ics);
    if (p.kind !== 'calendar') throw new Error('expected calendar');
    expect(p.summary).toBe('Team Sync');
    expect(p.location).toBe('Room 1');
    expect(p.allDay).toBe(false);
    expect(p.start?.getTime()).toBe(Date.UTC(2026, 6, 1, 9, 0, 0));
  });

  it('parseICalDate handles date-only as all-day', () => {
    const r = parseICalDate('20260701');
    expect(r?.allDay).toBe(true);
  });
});

describe('Boarding pass (IATA BCBP)', () => {
  it('parses the mandatory leg-1 fields', () => {
    // Fixed-width synthetic BCBP, fields padded to spec widths.
    const bcbp =
      'M1' +
      'DOE/JOHN'.padEnd(20) +
      'E' +
      'ABC123'.padEnd(7) +
      'OTP' +
      'LHR' +
      'RO '.padEnd(3) +
      '0123'.padEnd(5) +
      '182' +
      'Y' +
      '012A' +
      '0042'.padEnd(5) +
      '0' +
      '00';
    const p = parsePayload(bcbp);
    expect(p.kind).toBe('boardingpass');
    if (p.kind !== 'boardingpass') return;
    expect(p.passenger).toBe('JOHN DOE');
    expect(p.pnr).toBe('ABC123');
    expect(p.from).toBe('OTP');
    expect(p.to).toBe('LHR');
    expect(p.flight).toBe('RO 0123');
    expect(p.dayOfYear).toBe(182);
    expect(p.seat).toBe('012A');
  });
});

describe('SEPA payment (EPC)', () => {
  it('parses beneficiary, IBAN, amount, reference', () => {
    const epc = [
      'BCD',
      '002',
      '1',
      'SCT',
      'EXAMPLEBICXXX',
      'Example Charity',
      'DE89370400440532013000', // canonical public example IBAN
      'EUR12.50',
      '',
      '',
      'Donation 123'
    ].join('\n');
    const p = parsePayload(epc);
    if (p.kind !== 'sepa') throw new Error('expected sepa');
    expect(p.name).toBe('Example Charity');
    expect(p.iban).toBe('DE89370400440532013000');
    expect(p.currency).toBe('EUR');
    expect(p.amount).toBe('12.50');
    expect(p.reference).toBe('Donation 123');
  });
});

describe('OTP (otpauth)', () => {
  it('parses issuer, account and secret', () => {
    const p = parsePayload(
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=6&period=30'
    );
    if (p.kind !== 'otp') throw new Error('expected otp');
    expect(p.otpType).toBe('totp');
    expect(p.issuer).toBe('Example');
    expect(p.account).toBe('alice@example.com');
    expect(p.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(p.digits).toBe('6');
  });
});

describe('Generic URL and text', () => {
  it('classifies http(s) as url (no special parsing)', () => {
    expect(parsePayload('https://example.com/page').kind).toBe('url');
  });
  it('falls back to text', () => {
    expect(parsePayload('just some scanned text').kind).toBe('text');
  });
});

describe('File builders', () => {
  it('toVCard emits FN/TEL/EMAIL', () => {
    const c: ContactData = {
      kind: 'contact',
      raw: '',
      name: 'Jane Doe',
      phones: ['+15555550123'],
      emails: ['jane@example.com']
    };
    const vcf = toVCard(c);
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('FN:Jane Doe');
    expect(vcf).toContain('TEL:+15555550123');
    expect(vcf).toContain('EMAIL:jane@example.com');
    expect(vcf).toContain('END:VCARD');
  });

  it('toICS emits SUMMARY and DTSTART', () => {
    const e: CalendarData = {
      kind: 'calendar',
      raw: '',
      summary: 'Team Sync',
      start: new Date(Date.UTC(2026, 6, 1, 9, 0, 0)),
      allDay: false
    };
    const ics = toICS(e);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Team Sync');
    expect(ics).toContain('DTSTART:20260701T090000Z');
  });
});
