from scripts.db_manager import db

try:
    db.db.drop_table("thoughts")
    print("✅ Successfully dropped the 'thoughts' table!")
    print(
        "The new schema with the 'chapter' field will be created on your next ingest."
    )
except Exception as e:
    print(f"⚠️ Could not drop table. It might already be deleted or locked. Error: {e}")
