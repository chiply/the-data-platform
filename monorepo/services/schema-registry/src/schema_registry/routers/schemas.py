"""Schema-specific endpoints for the schema registry.

Implements CRUD operations backed by real database queries via
the injected async database session.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from schema_registry.dependencies import get_db_session
from schema_registry.exceptions import Conflict, NotFound
from schema_registry.models import Subject
from schema_registry.schemas import SubjectCreate, SubjectResponse

router = APIRouter(prefix="/schemas", tags=["schemas"])


@router.get("/", response_model=list[SubjectResponse])
async def list_schemas(
    session: AsyncSession = Depends(get_db_session),
) -> list[Subject]:
    """List all registered subjects."""
    result = await session.execute(select(Subject).order_by(Subject.name))
    return list(result.scalars().all())


@router.get("/{name}", response_model=SubjectResponse)
async def get_schema(
    name: str,
    session: AsyncSession = Depends(get_db_session),
) -> Subject:
    """Get a specific subject by name."""
    result = await session.execute(select(Subject).where(Subject.name == name))
    subject = result.scalar_one_or_none()
    if subject is None:
        raise NotFound(detail=f"Schema '{name}' not found")
    return subject


@router.post("/", response_model=SubjectResponse, status_code=201)
async def create_schema(
    body: SubjectCreate,
    session: AsyncSession = Depends(get_db_session),
) -> Subject:
    """Create a new subject."""
    subject = Subject(
        name=body.name,
        compatibility_mode=body.compatibility_mode.value,
        description=body.description,
    )
    session.add(subject)
    try:
        await session.commit()
    except IntegrityError as err:
        await session.rollback()
        raise Conflict(detail=f"Subject '{body.name}' already exists") from err
    await session.refresh(subject)
    return subject
