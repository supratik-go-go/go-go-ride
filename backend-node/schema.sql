-- GO-GO Ride database schema (same tables/columns as the Prisma/Node and FastAPI services).

-- Used only to create a brand-new empty database; normally the existing gogoride.db is used.

PRAGMA foreign_keys = ON;



CREATE TABLE "ActivityLog" (
	id VARCHAR NOT NULL, 
	"actorId" VARCHAR, 
	action VARCHAR NOT NULL, 
	"entityType" VARCHAR, 
	"entityId" VARCHAR, 
	message TEXT NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("actorId") REFERENCES "User" (id)
);

CREATE TABLE "Alarm" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	"busId" VARCHAR NOT NULL, 
	"boardingStopId" VARCHAR NOT NULL, 
	"arrivalStopId" VARCHAR NOT NULL, 
	"alarmDate" BIGINT NOT NULL, 
	"expectedArrival" VARCHAR NOT NULL, 
	"remindBeforeMin" INTEGER NOT NULL, 
	status VARCHAR NOT NULL, 
	"notifiedAt" BIGINT, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE, 
	FOREIGN KEY("busId") REFERENCES "Bus" (id) ON DELETE CASCADE, 
	FOREIGN KEY("boardingStopId") REFERENCES "BusStop" (id), 
	FOREIGN KEY("arrivalStopId") REFERENCES "BusStop" (id)
);

CREATE TABLE "Booking" (
	id VARCHAR NOT NULL, 
	"bookingRef" VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	type VARCHAR NOT NULL, 
	"busId" VARCHAR, 
	"rideId" VARCHAR, 
	"localCarId" VARCHAR, 
	"travelDate" BIGINT NOT NULL, 
	seats INTEGER NOT NULL, 
	amount FLOAT NOT NULL, 
	"paymentMode" VARCHAR NOT NULL, 
	"paymentStatus" VARCHAR NOT NULL, 
	status VARCHAR NOT NULL, 
	"cancelReason" TEXT, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id), 
	FOREIGN KEY("busId") REFERENCES "Bus" (id), 
	FOREIGN KEY("rideId") REFERENCES "Ride" (id), 
	FOREIGN KEY("localCarId") REFERENCES "LocalCar" (id)
);

CREATE TABLE "Bus" (
	id VARCHAR NOT NULL, 
	"busNumber" VARCHAR NOT NULL, 
	"busName" VARCHAR, 
	"ownerId" VARCHAR NOT NULL, 
	"routeId" VARCHAR, 
	type VARCHAR NOT NULL, 
	category VARCHAR NOT NULL, 
	operator VARCHAR, 
	"totalSeats" INTEGER NOT NULL, 
	fare FLOAT NOT NULL, 
	"contactNumber" VARCHAR, 
	"contactStart" VARCHAR NOT NULL, 
	"contactEnd" VARCHAR NOT NULL, 
	"serviceDays" VARCHAR NOT NULL, 
	"imageUrl" VARCHAR, 
	status VARCHAR NOT NULL, 
	"rejectionReason" TEXT, 
	"ratingAvg" FLOAT NOT NULL, 
	"ratingCount" INTEGER NOT NULL, 
	"submittedAt" BIGINT NOT NULL, 
	"reviewedAt" BIGINT, 
	"reviewedById" VARCHAR, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("ownerId") REFERENCES "User" (id), 
	FOREIGN KEY("routeId") REFERENCES "Route" (id), 
	FOREIGN KEY("reviewedById") REFERENCES "User" (id)
);

CREATE TABLE "BusDocument" (
	id VARCHAR NOT NULL, 
	"busId" VARCHAR NOT NULL, 
	"docType" VARCHAR NOT NULL, 
	"fileUrl" VARCHAR NOT NULL, 
	"originalName" VARCHAR, 
	"uploadedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("busId") REFERENCES "Bus" (id) ON DELETE CASCADE
);

CREATE TABLE "BusException" (
	id VARCHAR NOT NULL, 
	"busId" VARCHAR NOT NULL, 
	date BIGINT NOT NULL, 
	reason TEXT, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE ("busId", date), 
	FOREIGN KEY("busId") REFERENCES "Bus" (id) ON DELETE CASCADE
);

CREATE TABLE "BusStop" (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	area VARCHAR, 
	city VARCHAR NOT NULL, 
	latitude FLOAT, 
	longitude FLOAT, 
	status VARCHAR NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name, city)
);

CREATE TABLE "BusStopage" (
	id VARCHAR NOT NULL, 
	"busId" VARCHAR NOT NULL, 
	"stopId" VARCHAR NOT NULL, 
	sequence INTEGER NOT NULL, 
	"arrivalTime" VARCHAR NOT NULL, 
	"departureTime" VARCHAR NOT NULL, 
	"distanceKm" FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE ("busId", sequence), 
	FOREIGN KEY("busId") REFERENCES "Bus" (id) ON DELETE CASCADE, 
	FOREIGN KEY("stopId") REFERENCES "BusStop" (id) ON DELETE CASCADE
);

CREATE TABLE "Favorite" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	"itemType" VARCHAR NOT NULL, 
	"itemId" VARCHAR NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE ("userId", "itemType", "itemId"), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE
);

CREATE TABLE "LocalCar" (
	id VARCHAR NOT NULL, 
	"ownerId" VARCHAR, 
	"driverName" VARCHAR NOT NULL, 
	phone VARCHAR NOT NULL, 
	area VARCHAR NOT NULL, 
	"carModel" VARCHAR, 
	"carNumber" VARCHAR, 
	"photoUrl" VARCHAR, 
	"availableFrom" VARCHAR NOT NULL, 
	"availableTo" VARCHAR NOT NULL, 
	"ratingAvg" FLOAT NOT NULL, 
	"ratingCount" INTEGER NOT NULL, 
	verified BOOLEAN NOT NULL, 
	status VARCHAR NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("ownerId") REFERENCES "User" (id)
);

CREATE TABLE "LoginActivity" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	device VARCHAR, 
	"ipAddress" VARCHAR, 
	location VARCHAR, 
	status VARCHAR NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE
);

CREATE TABLE "Notification" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR, 
	title VARCHAR NOT NULL, 
	message TEXT NOT NULL, 
	type VARCHAR NOT NULL, 
	link VARCHAR, 
	"isRead" BOOLEAN NOT NULL, 
	"readAt" BIGINT, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE
);

CREATE TABLE "OtpCode" (
	id VARCHAR NOT NULL, 
	phone VARCHAR NOT NULL, 
	"codeHash" VARCHAR NOT NULL, 
	purpose VARCHAR NOT NULL, 
	"expiresAt" BIGINT NOT NULL, 
	"consumedAt" BIGINT, 
	attempts INTEGER NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE "RecentSearch" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	"searchType" VARCHAR NOT NULL, 
	"fromText" VARCHAR, 
	"toText" VARCHAR, 
	"query" VARCHAR, 
	"searchedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE
);

CREATE TABLE "RefreshToken" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	"tokenHash" VARCHAR NOT NULL, 
	"expiresAt" BIGINT NOT NULL, 
	"revokedAt" BIGINT, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE
);

CREATE TABLE "Review" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR NOT NULL, 
	"busId" VARCHAR, 
	"localCarId" VARCHAR, 
	rating INTEGER NOT NULL, 
	comment TEXT, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE ("userId", "busId"), 
	FOREIGN KEY("userId") REFERENCES "User" (id) ON DELETE CASCADE, 
	FOREIGN KEY("busId") REFERENCES "Bus" (id) ON DELETE CASCADE, 
	FOREIGN KEY("localCarId") REFERENCES "LocalCar" (id) ON DELETE CASCADE
);

CREATE TABLE "Ride" (
	id VARCHAR NOT NULL, 
	"routeId" VARCHAR, 
	"fromStopId" VARCHAR NOT NULL, 
	"toStopId" VARCHAR NOT NULL, 
	"driverId" VARCHAR, 
	"vehicleType" VARCHAR NOT NULL, 
	"departureAt" BIGINT NOT NULL, 
	"totalSeats" INTEGER NOT NULL, 
	"availableSeats" INTEGER NOT NULL, 
	"farePerSeat" FLOAT NOT NULL, 
	status VARCHAR NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("routeId") REFERENCES "Route" (id), 
	FOREIGN KEY("fromStopId") REFERENCES "BusStop" (id), 
	FOREIGN KEY("toStopId") REFERENCES "BusStop" (id), 
	FOREIGN KEY("driverId") REFERENCES "User" (id)
);

CREATE TABLE "RideWaitlist" (
	id VARCHAR NOT NULL, 
	"userId" VARCHAR, 
	phone VARCHAR NOT NULL, 
	area VARCHAR, 
	"createdAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id), 
	UNIQUE (phone)
);

CREATE TABLE "Route" (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	"routeNumber" VARCHAR NOT NULL, 
	"fromStopId" VARCHAR, 
	"toStopId" VARCHAR, 
	"distanceKm" FLOAT NOT NULL, 
	status VARCHAR NOT NULL, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("fromStopId") REFERENCES "BusStop" (id), 
	FOREIGN KEY("toStopId") REFERENCES "BusStop" (id)
);

CREATE TABLE "RouteStop" (
	id VARCHAR NOT NULL, 
	"routeId" VARCHAR NOT NULL, 
	"stopId" VARCHAR NOT NULL, 
	sequence INTEGER NOT NULL, 
	"distanceFromStartKm" FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE ("routeId", sequence), 
	FOREIGN KEY("routeId") REFERENCES "Route" (id) ON DELETE CASCADE, 
	FOREIGN KEY("stopId") REFERENCES "BusStop" (id) ON DELETE CASCADE
);

CREATE TABLE "Setting" (
	id VARCHAR NOT NULL, 
	"platformName" VARCHAR NOT NULL, 
	"platformEmail" VARCHAR NOT NULL, 
	"contactNumber" VARCHAR NOT NULL, 
	address VARCHAR NOT NULL, 
	timezone VARCHAR NOT NULL, 
	currency VARCHAR NOT NULL, 
	"dateFormat" VARCHAR NOT NULL, 
	"timeFormat" VARCHAR NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE "SupportTicket" (
	id VARCHAR NOT NULL, 
	"ticketRef" VARCHAR NOT NULL, 
	"userId" VARCHAR, 
	name VARCHAR NOT NULL, 
	phone VARCHAR NOT NULL, 
	email VARCHAR, 
	category VARCHAR NOT NULL, 
	subject VARCHAR NOT NULL, 
	message TEXT NOT NULL, 
	status VARCHAR NOT NULL, 
	priority VARCHAR NOT NULL, 
	response TEXT, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY("userId") REFERENCES "User" (id)
);

CREATE TABLE "User" (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	phone VARCHAR NOT NULL, 
	email VARCHAR, 
	"passwordHash" VARCHAR, 
	role VARCHAR NOT NULL, 
	"avatarUrl" VARCHAR, 
	status VARCHAR NOT NULL, 
	"phoneVerified" BOOLEAN NOT NULL, 
	"lastLoginAt" BIGINT, 
	"createdAt" BIGINT NOT NULL, 
	"updatedAt" BIGINT NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE INDEX "ix_Alarm_alarmDate" ON "Alarm" ("alarmDate");

CREATE INDEX "ix_Alarm_userId" ON "Alarm" ("userId");

CREATE UNIQUE INDEX "ix_Booking_bookingRef" ON "Booking" ("bookingRef");

CREATE INDEX "ix_Booking_travelDate" ON "Booking" ("travelDate");

CREATE INDEX "ix_Booking_userId" ON "Booking" ("userId");

CREATE INDEX "ix_BusDocument_busId" ON "BusDocument" ("busId");

CREATE INDEX "ix_BusStop_name" ON "BusStop" (name);

CREATE INDEX "ix_BusStopage_stopId" ON "BusStopage" ("stopId");

CREATE UNIQUE INDEX "ix_Bus_busNumber" ON "Bus" ("busNumber");

CREATE INDEX "ix_Bus_ownerId" ON "Bus" ("ownerId");

CREATE INDEX "ix_Bus_status" ON "Bus" (status);

CREATE INDEX "ix_LocalCar_area" ON "LocalCar" (area);

CREATE INDEX "ix_LoginActivity_userId" ON "LoginActivity" ("userId");

CREATE INDEX "ix_Notification_userId" ON "Notification" ("userId");

CREATE INDEX "ix_OtpCode_phone" ON "OtpCode" (phone);

CREATE INDEX "ix_RecentSearch_userId" ON "RecentSearch" ("userId");

CREATE UNIQUE INDEX "ix_RefreshToken_tokenHash" ON "RefreshToken" ("tokenHash");

CREATE INDEX "ix_RefreshToken_userId" ON "RefreshToken" ("userId");

CREATE INDEX "ix_Ride_departureAt" ON "Ride" ("departureAt");

CREATE INDEX "ix_RouteStop_stopId" ON "RouteStop" ("stopId");

CREATE UNIQUE INDEX "ix_Route_routeNumber" ON "Route" ("routeNumber");

CREATE INDEX "ix_SupportTicket_status" ON "SupportTicket" (status);

CREATE UNIQUE INDEX "ix_SupportTicket_ticketRef" ON "SupportTicket" ("ticketRef");

CREATE UNIQUE INDEX "ix_User_phone" ON "User" (phone);
