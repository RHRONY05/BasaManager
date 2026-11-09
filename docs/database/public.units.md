# public.units

## Description

A rentable flat, room or shop in a building.

## Columns

| Name                | Type                        | Default           | Nullable | Children                                                                                                                                                                                        | Parents                                                                                 | Comment |
| ------------------- | --------------------------- | ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| id                  | uuid                        | gen_random_uuid() | false    | [public.unit_charges](public.unit_charges.md) [public.leases](public.leases.md) [public.meter_readings](public.meter_readings.md) [public.maintenance_requests](public.maintenance_requests.md) |                                                                                         |         |
| org_id              | uuid                        |                   | false    | [public.unit_charges](public.unit_charges.md) [public.leases](public.leases.md) [public.meter_readings](public.meter_readings.md) [public.maintenance_requests](public.maintenance_requests.md) | [public.organizations](public.organizations.md) [public.buildings](public.buildings.md) |         |
| building_id         | uuid                        |                   | false    |                                                                                                                                                                                                 | [public.buildings](public.buildings.md)                                                 |         |
| label               | text                        |                   | false    |                                                                                                                                                                                                 |                                                                                         |         |
| floor               | smallint                    |                   | false    |                                                                                                                                                                                                 |                                                                                         |         |
| type                | unit_type                   |                   | false    |                                                                                                                                                                                                 |                                                                                         |         |
| default_rent_poisha | bigint                      |                   | false    |                                                                                                                                                                                                 |                                                                                         |         |
| electricity_mode    | electricity_mode            |                   | false    |                                                                                                                                                                                                 |                                                                                         |         |
| archived_at         | timestamp(6) with time zone |                   | true     |                                                                                                                                                                                                 |                                                                                         |         |
| created_at          | timestamp(6) with time zone | CURRENT_TIMESTAMP | false    |                                                                                                                                                                                                 |                                                                                         |         |
| updated_at          | timestamp(6) with time zone | CURRENT_TIMESTAMP | false    |                                                                                                                                                                                                 |                                                                                         |         |

## Constraints

| Name                          | Type        | Definition                                                                             |
| ----------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| units_default_rent_check      | CHECK       | CHECK ((default_rent_poisha >= 0))                                                     |
| units_org_id_fkey             | FOREIGN KEY | FOREIGN KEY (org_id) REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT |
| units_pkey                    | PRIMARY KEY | PRIMARY KEY (id)                                                                       |
| units_org_id_building_id_fkey | FOREIGN KEY | FOREIGN KEY (org_id, building_id) REFERENCES buildings(org_id, id) ON DELETE RESTRICT  |

## Indexes

| Name                               | Definition                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| units_pkey                         | CREATE UNIQUE INDEX units_pkey ON public.units USING btree (id)                                                 |
| units_org_id_building_id_label_key | CREATE UNIQUE INDEX units_org_id_building_id_label_key ON public.units USING btree (org_id, building_id, label) |
| units_org_id_id_key                | CREATE UNIQUE INDEX units_org_id_id_key ON public.units USING btree (org_id, id)                                |

## Relations

![er](public.units.svg)

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
