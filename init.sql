CREATE TABLE seats_balance (
  ID SERIAL PRIMARY KEY,
  total_seats integer NOT NULL,
  paid_seats integer NOT NULL,
  reserved_seats integer NOT NULL,
  available_seats integer NOT NULL
);

INSERT INTO seats_balance(total_seats, paid_seats, reserved_seats, available_seats)
VALUES (10, 4, 5, 5);
